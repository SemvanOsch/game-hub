/**
 * Pure Zip Battle Royale match rules — no React, no networking, no I/O beyond an
 * injected clock/RNG. The server drives this through the engine adapter in
 * `game.ts`, which supplies `Date.now()` so all official timing is
 * server-authoritative.
 *
 * A match is exactly three rounds. Each round every player races the *same*
 * puzzle; the server records each player's official completion time (server
 * clock minus the round's official start), ranks finishers by time, awards
 * placement points (max points == player count), and accumulates a leaderboard.
 * After three rounds the match is complete and final standings are frozen.
 *
 * Phases within the single "game": `active` (a round is running — the leading
 * `startAt` may be in the future, which is the pre-round countdown),
 * `round_results` (round ranked, waiting for the host to continue), and
 * `complete` (match over → the server emits game_over / final results).
 */
import type { EngineActionResult } from '../games/types'
import { generateMatchPuzzles, mulberry32 } from './generate'
import type { ZipPuzzle } from './puzzles'
import { validatePath, type ZipInvalidReason } from './validate'

export const TOTAL_ROUNDS = 3
/** Pre-round 3·2·1 countdown before a round's official start. */
export const COUNTDOWN_MS = 3000
/** Server-authoritative maximum time to solve a round before unfinished players DNF. */
export const ROUND_DURATION_MS = 120_000
/** Tie-break penalty added per DNF round when comparing cumulative times. */
const DNF_TIME_PENALTY_MS = ROUND_DURATION_MS * 2

export type ZipPhase = 'generating' | 'active' | 'round_results' | 'complete'

/** One player's outcome for one round (authoritative). */
export interface ZipRoundResult {
  finished: boolean
  dnf: boolean
  /** Official completion time in ms (server clock − round start); null if unfinished. */
  completionMs: number | null
  /** The submitted, server-validated path. Kept for auditing; never revealed to others. */
  path?: number[]
}

/** A finalised ranking row for a round. */
export interface ZipPlacement {
  playerId: string
  /** 1-based finishing position; finishers first, then DNF players. */
  place: number
  completionMs: number | null
  dnf: boolean
  points: number
}

export interface ZipRound {
  index: number
  puzzleId: string
  /** Official round start (epoch ms). Until this, the round is in countdown. */
  startAt: number
  /** Epoch ms after which unfinished players DNF and the round is ranked. */
  timeoutAt: number
  /** Per-player outcome, keyed by the players present when the round started. */
  results: Record<string, ZipRoundResult>
  /** Ranking, set when the round is finalised (null while running). */
  placements: ZipPlacement[] | null
}

export interface ZipMatchState {
  phase: ZipPhase
  /** Players currently in the match (mirrors the room; leavers are removed). */
  playerOrder: string[]
  /** Host player id (always the first current player; gates round transitions). */
  hostId: string
  totalRounds: number
  /** 0-based index of the current/last round. */
  currentRound: number
  /**
   * The three puzzles for this match (same for every player), generated when the
   * match starts. Empty only during the brief `generating` phase.
   */
  puzzles: ZipPuzzle[]
  /** One entry per round reached so far. */
  rounds: ZipRound[]
  /** Cumulative points per player id (retained even if a player leaves). */
  totals: Record<string, number>
  /** Seed for deterministic puzzle generation (consumed once, in `generating`). */
  seed: number
  /** Epoch ms at which the server should run generation (during `generating`). */
  generateAt: number
}

function fail(
  code: 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER',
  message: string
): EngineActionResult<ZipMatchState> {
  return { ok: false, code, message }
}

function freshRound(index: number, puzzleId: string, playerOrder: string[], now: number): ZipRound {
  const startAt = now + COUNTDOWN_MS
  const results: Record<string, ZipRoundResult> = {}
  for (const id of playerOrder) {
    results[id] = { finished: false, dnf: false, completionMs: null }
  }
  return { index, puzzleId, startAt, timeoutAt: startAt + ROUND_DURATION_MS, results, placements: null }
}

/**
 * Create a new match for an ordered list of player ids. The three puzzles are
 * NOT generated here — the match opens in the brief `generating` phase and the
 * server produces the puzzles on the next tick (so clients see a short
 * "generating" screen instead of a frozen click). `rng`/`now` are injectable for
 * deterministic tests; the adapter passes `Math.random`/`Date.now`.
 */
export function createMatch(
  playerOrder: string[],
  _options?: unknown,
  now: number = Date.now(),
  rng: () => number = Math.random
): ZipMatchState {
  const order = [...playerOrder]
  const totals: Record<string, number> = {}
  for (const id of order) totals[id] = 0
  return {
    phase: 'generating',
    playerOrder: order,
    hostId: order[0] ?? '',
    totalRounds: TOTAL_ROUNDS,
    currentRound: 0,
    puzzles: [],
    rounds: [],
    totals,
    seed: Math.floor(rng() * 0x7fffffff),
    generateAt: now
  }
}

/**
 * Generate the match's puzzles and open round 1. Called once, from `tickMatch`,
 * the tick after the match is created. Deterministic given the stored seed.
 */
function beginMatch(state: ZipMatchState, now: number): ZipMatchState {
  const puzzles = generateMatchPuzzles(mulberry32(state.seed))
  return {
    ...state,
    puzzles,
    rounds: [freshRound(0, puzzles[0].id, state.playerOrder, now)],
    currentRound: 0,
    phase: 'active'
  }
}

function currentRoundState(state: ZipMatchState): ZipRound {
  return state.rounds[state.currentRound]
}

/** Whether every player in a round has a terminal outcome (finished or DNF). */
function roundComplete(round: ZipRound): boolean {
  return Object.values(round.results).every((r) => r.finished || r.dnf)
}

/**
 * Rank a round and award points, then move to the results phase. Pure: relies
 * only on already-recorded completion times / DNF flags, so it needs no clock.
 * Finishers are ordered by completion time (ties broken by join order); DNF
 * players follow. Points = playerCount for 1st down to 1 for last finisher; DNF
 * scores 0. The per-round player count sets the maximum points for that round.
 */
function finalizeRound(state: ZipMatchState): ZipMatchState {
  const round = currentRoundState(state)
  const ids = Object.keys(round.results)
  const orderIndex = new Map(state.playerOrder.map((id, i) => [id, i]))
  const seat = (id: string) => orderIndex.get(id) ?? Number.MAX_SAFE_INTEGER

  const finishers = ids
    .filter((id) => round.results[id].finished && !round.results[id].dnf)
    .sort((a, b) => {
      const ta = round.results[a].completionMs ?? Infinity
      const tb = round.results[b].completionMs ?? Infinity
      if (ta !== tb) return ta - tb
      return seat(a) - seat(b)
    })
  const dnf = ids
    .filter((id) => !(round.results[id].finished && !round.results[id].dnf))
    .sort((a, b) => seat(a) - seat(b))

  const n = ids.length
  const ranked = [...finishers, ...dnf]
  const placements: ZipPlacement[] = ranked.map((id, i) => {
    const isDnf = !(round.results[id].finished && !round.results[id].dnf)
    const place = i + 1
    return {
      playerId: id,
      place,
      completionMs: isDnf ? null : round.results[id].completionMs,
      dnf: isDnf,
      points: isDnf ? 0 : n - i
    }
  })

  const totals = { ...state.totals }
  for (const p of placements) totals[p.playerId] = (totals[p.playerId] ?? 0) + p.points

  const rounds = state.rounds.map((r) => (r.index === round.index ? { ...r, placements } : r))
  return { ...state, rounds, totals, phase: 'round_results' }
}

/**
 * A player submits a completed path for a round. Fully server-authoritative:
 * verifies the round is live and started, that the submission targets the
 * current round, that the player has not already finished, and independently
 * validates the path against the server's own puzzle. Only then is the official
 * completion time recorded. The round is finalised early once everyone is done.
 */
export function submitSolution(
  state: ZipMatchState,
  playerId: string,
  round: number,
  path: number[],
  now: number
): EngineActionResult<ZipMatchState> {
  if (state.phase === 'complete') return fail('GAME_OVER', 'The match has finished.')
  if (state.phase !== 'active') return fail('INVALID_ACTION', 'No round is currently running.')
  if (round !== state.currentRound) return fail('INVALID_ACTION', 'That round is no longer active.')

  const r = currentRoundState(state)
  const result = r.results[playerId]
  if (!result) return fail('INVALID_ACTION', 'You are not part of this match.')
  if (result.finished || result.dnf) return fail('INVALID_ACTION', 'You have already finished this round.')
  if (now < r.startAt) return fail('INVALID_ACTION', 'The round has not started yet.')
  if (now > r.timeoutAt) return fail('INVALID_ACTION', 'Time is up for this round.')

  const puzzle = state.puzzles.find((p) => p.id === r.puzzleId)
  if (!puzzle) return fail('INVALID_ACTION', 'The puzzle is unavailable.')
  const check = validatePath(puzzle, path)
  if (!check.ok) return fail('INVALID_ACTION', invalidMessage(check.reason))

  const completionMs = now - r.startAt
  const nextResult: ZipRoundResult = { finished: true, dnf: false, completionMs, path: [...path] }
  const rounds = state.rounds.map((rr) =>
    rr.index === r.index ? { ...rr, results: { ...rr.results, [playerId]: nextResult } } : rr
  )
  let next: ZipMatchState = { ...state, rounds }
  if (roundComplete(rounds[state.currentRound])) next = finalizeRound(next)
  return { ok: true, state: next }
}

function invalidMessage(reason: ZipInvalidReason): string {
  switch (reason) {
    case 'BAD_START':
      return 'The path must start at cell 1.'
    case 'NOT_ADJACENT':
      return 'The path can only move between adjacent cells.'
    case 'WALL':
      return 'The path cannot cross a wall.'
    case 'REVISIT':
      return 'The path cannot reuse a cell.'
    case 'CHECKPOINT_ORDER':
      return 'Numbered cells must be visited in order.'
    case 'BAD_END':
      return 'The path must end on the last numbered cell.'
    case 'INCOMPLETE':
      return 'The path must fill every cell.'
    default:
      return 'That solution is not valid.'
  }
}

/**
 * Host-only transition from the round results to the next round (or to the final
 * results after round 3). Cannot be triggered before the round is ranked, and
 * never produces a fourth round.
 */
export function advanceRound(
  state: ZipMatchState,
  playerId: string,
  now: number
): EngineActionResult<ZipMatchState> {
  if (playerId !== state.hostId) return fail('INVALID_ACTION', 'Only the host can continue.')
  if (state.phase !== 'round_results') {
    return fail('INVALID_ACTION', 'You can only continue from the round results.')
  }
  if (state.currentRound >= state.totalRounds - 1) {
    return { ok: true, state: { ...state, phase: 'complete' } }
  }
  const nextIndex = state.currentRound + 1
  const round = freshRound(nextIndex, state.puzzles[nextIndex].id, state.playerOrder, now)
  return {
    ok: true,
    state: { ...state, currentRound: nextIndex, rounds: [...state.rounds, round], phase: 'active' }
  }
}

/**
 * Time-based transition: once the round's timeout passes, any unfinished player
 * is marked DNF and the round is ranked. Called by the server when the wall
 * clock reaches {@link nextTimeout}.
 */
export function tickMatch(state: ZipMatchState, now: number): ZipMatchState {
  // First tick after creation: generate the puzzles and open round 1.
  if (state.phase === 'generating') return beginMatch(state, now)
  if (state.phase !== 'active') return state
  const r = currentRoundState(state)
  if (now < r.timeoutAt) return state
  const results: Record<string, ZipRoundResult> = {}
  for (const [id, res] of Object.entries(r.results)) {
    results[id] = res.finished || res.dnf ? res : { finished: false, dnf: true, completionMs: null }
  }
  const rounds = state.rounds.map((rr) => (rr.index === r.index ? { ...rr, results } : rr))
  return finalizeRound({ ...state, rounds })
}

/** The next server timeout for this state, or null when nothing is pending. */
export function nextTimeout(state: ZipMatchState): number | null {
  if (state.phase === 'generating') return state.generateAt // run generation asap
  if (state.phase === 'active') return currentRoundState(state).timeoutAt
  return null
}

/**
 * Remove a player who left/disconnected. Their recorded results and points are
 * kept (so past rounds and the leaderboard stay intact), but they no longer
 * start future rounds. If they were mid-round they are marked DNF, which may
 * complete the round. Host passes to the next remaining player. Returns null
 * only when nobody is left.
 */
export function removePlayerFromMatch(
  state: ZipMatchState,
  playerId: string
): ZipMatchState | null {
  if (!state.playerOrder.includes(playerId)) return state
  const playerOrder = state.playerOrder.filter((id) => id !== playerId)
  if (playerOrder.length === 0) return null

  let next: ZipMatchState = { ...state, playerOrder, hostId: playerOrder[0] }

  // Mark them DNF in a still-running round so it can be ranked/completed.
  if (next.phase === 'active') {
    const r = currentRoundState(next)
    const res = r.results[playerId]
    if (res && !res.finished && !res.dnf) {
      const results = { ...r.results, [playerId]: { finished: false, dnf: true, completionMs: null } }
      const rounds = next.rounds.map((rr) => (rr.index === r.index ? { ...rr, results } : rr))
      next = { ...next, rounds }
      if (roundComplete(rounds[next.currentRound])) next = finalizeRound(next)
    }
  }
  return next
}

// ---------------------------------------------------------------------------
// Standings (leaderboard + final ranking)
// ---------------------------------------------------------------------------

export interface ZipStanding {
  playerId: string
  total: number
  /** Number of rounds this player finished 1st. */
  roundWins: number
  /** Cumulative completion time (DNF rounds penalised), for tie-breaking. */
  cumTimeMs: number
  /** 1-based rank after all tie-breakers. */
  rank: number
}

/** Every player id that has ever been part of the match (retains leavers). */
function allPlayerIds(state: ZipMatchState): string[] {
  const ids = new Set<string>(Object.keys(state.totals))
  for (const id of state.playerOrder) ids.add(id)
  return [...ids]
}

/**
 * Full standings, deterministically ranked by: total points (desc), then round
 * wins (desc), then cumulative completion time (asc, with a fixed penalty per
 * DNF round), then join order — so results never depend on client ordering.
 */
export function computeStandings(state: ZipMatchState): ZipStanding[] {
  const orderIndex = new Map(state.playerOrder.map((id, i) => [id, i]))
  const seat = (id: string) => orderIndex.get(id) ?? Number.MAX_SAFE_INTEGER

  const rows = allPlayerIds(state).map((playerId) => {
    let roundWins = 0
    let cumTimeMs = 0
    for (const round of state.rounds) {
      const res = round.results[playerId]
      const placement = round.placements?.find((p) => p.playerId === playerId)
      if (placement && placement.place === 1 && !placement.dnf) roundWins++
      if (res && res.finished && res.completionMs !== null) cumTimeMs += res.completionMs
      else if (round.placements) cumTimeMs += DNF_TIME_PENALTY_MS
    }
    return { playerId, total: state.totals[playerId] ?? 0, roundWins, cumTimeMs, rank: 0 }
  })

  rows.sort((a, b) => {
    if (a.total !== b.total) return b.total - a.total
    if (a.roundWins !== b.roundWins) return b.roundWins - a.roundWins
    if (a.cumTimeMs !== b.cumTimeMs) return a.cumTimeMs - b.cumTimeMs
    return seat(a.playerId) - seat(b.playerId)
  })
  rows.forEach((row, i) => (row.rank = i + 1))
  return rows
}

/**
 * Winner id(s) — only meaningful once the match is complete. Returns everyone
 * genuinely tied at the top (identical points, round wins and cumulative time);
 * in practice join order breaks any remaining tie to a single winner.
 */
export function getWinnerIds(state: ZipMatchState): string[] {
  if (state.phase !== 'complete') return []
  const standings = computeStandings(state)
  if (standings.length === 0) return []
  const top = standings[0]
  return standings
    .filter(
      (s) => s.total === top.total && s.roundWins === top.roundWins && s.cumTimeMs === top.cumTimeMs
    )
    .map((s) => s.playerId)
}

export function isMatchFinished(state: ZipMatchState): boolean {
  return state.phase === 'complete'
}
