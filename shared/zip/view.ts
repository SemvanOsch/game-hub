/**
 * Client-facing Zip view + serializer. This is the single choke point that
 * decides what each player is allowed to see.
 *
 * Hidden information enforced here:
 *   - No player ever receives another player's in-progress or submitted *path*.
 *   - During a live round, other players' exact *completion times* are withheld —
 *     only "finished / still solving / DNF" status leaks, keeping the race tense.
 *     Exact times appear only once the round is finalised (round_results) and in
 *     the final results.
 * The puzzle itself is public (every player must solve the same one).
 */
import { computeStandings, type ZipMatchState, type ZipPhase, type ZipPlacement } from './engine'
import type { ZipPuzzle } from './puzzles'

/** A player's live status during a round (no times revealed). */
export interface ZipPlayerStatus {
  id: string
  finished: boolean
  dnf: boolean
}

/** One row of the always-available leaderboard (points only, never times). */
export interface ZipLeaderboardRow {
  playerId: string
  total: number
  position: number
}

/** Per-round breakdown for the final results table. */
export interface ZipFinalRound {
  puzzleId: string
  placements: ZipPlacement[]
}

export interface ZipFinal {
  standings: Array<{ playerId: string; total: number; rank: number; roundWins: number }>
  rounds: ZipFinalRound[]
  winnerIds: string[]
}

export interface ZipView {
  phase: ZipPhase
  selfId: string
  hostId: string
  totalRounds: number
  /** 0-based index of the current round. */
  currentRound: number
  /** 1-based round number for display. */
  roundNumber: number
  puzzleIds: string[]
  /** The current round's puzzle (public). */
  puzzle: ZipPuzzle | null
  /** Official round start (epoch ms); until then the round is counting down. */
  startAt: number
  /** Epoch ms when the round times out. */
  timeoutAt: number
  /** Server time when this view was produced, for client clock calibration. */
  serverNow: number
  /** The local player's own round outcome (times allowed for oneself). */
  self: { finished: boolean; dnf: boolean; completionMs: number | null }
  /** Live status of every player (no opponent times). */
  players: ZipPlayerStatus[]
  /** Always-available cumulative leaderboard (points + position, no times). */
  leaderboard: ZipLeaderboardRow[]
  /** Present only in round_results / complete: the finished round's ranking (with times). */
  roundResults: ZipPlacement[] | null
  /** Present only when the match is complete: the final breakdown. */
  final: ZipFinal | null
}

export type ZipResults = ZipFinal

function buildFinal(state: ZipMatchState): ZipFinal {
  const standings = computeStandings(state)
  return {
    standings: standings.map((s) => ({
      playerId: s.playerId,
      total: s.total,
      rank: s.rank,
      roundWins: s.roundWins
    })),
    rounds: state.rounds.map((r) => ({ puzzleId: r.puzzleId, placements: r.placements ?? [] })),
    winnerIds:
      state.phase === 'complete'
        ? (() => {
            if (standings.length === 0) return []
            const top = standings[0]
            return standings
              .filter(
                (s) =>
                  s.total === top.total &&
                  s.roundWins === top.roundWins &&
                  s.rank === top.rank
              )
              .map((s) => s.playerId)
          })()
        : []
  }
}

export function getPlayerView(state: ZipMatchState, playerId: string): ZipView {
  const round = state.rounds[state.currentRound]
  const revealTimes = state.phase !== 'active' // round_results or complete
  const selfResult = round?.results[playerId]

  const players: ZipPlayerStatus[] = Object.entries(round?.results ?? {}).map(([id, r]) => ({
    id,
    finished: r.finished,
    dnf: r.dnf
  }))

  const leaderboard: ZipLeaderboardRow[] = computeStandings(state).map((s) => ({
    playerId: s.playerId,
    total: s.total,
    position: s.rank
  }))

  return {
    phase: state.phase,
    selfId: playerId,
    hostId: state.hostId,
    totalRounds: state.totalRounds,
    currentRound: state.currentRound,
    roundNumber: state.currentRound + 1,
    puzzleIds: state.puzzles.map((p) => p.id),
    puzzle: round ? state.puzzles.find((p) => p.id === round.puzzleId) ?? null : null,
    startAt: round?.startAt ?? 0,
    timeoutAt: round?.timeoutAt ?? 0,
    serverNow: Date.now(),
    self: {
      finished: selfResult?.finished ?? false,
      dnf: selfResult?.dnf ?? false,
      completionMs: selfResult?.completionMs ?? null
    },
    players,
    leaderboard,
    roundResults: revealTimes ? round?.placements ?? null : null,
    final: state.phase === 'complete' ? buildFinal(state) : null
  }
}

export function getResults(state: ZipMatchState): ZipResults {
  return buildFinal(state)
}
