/**
 * Pure, authoritative Rummikub rules — no React, no networking, no I/O beyond
 * Math.random (bag shuffling). The reducers are total and never mutate their
 * input (they deep-clone).
 *
 * SECURITY / TRUST MODEL: a turn is committed as a *whole proposed end state*
 * (the full table plus the player's remaining rack). Rummikub allows arbitrary
 * rearrangement of the table within a turn, so rather than validating each drag,
 * the client builds a working state locally and submits it once. The server then
 * checks the proposal against the official state captured at the turn's start:
 *
 *   - tile conservation (nothing invented, duplicated, or lost)
 *   - ownership (only the player's own rack tiles may be added; table tiles may
 *     never be pulled back into a hand)
 *   - every resulting group is a legal run or set
 *   - the initial 30-point meld requirement, for a player who has not "opened"
 *
 * The authoritative state holds every tile in a private registry and the pool
 * order; `getPlayerView` (see view.ts) strips what a player may not see.
 */
import type { ActionErrorCode, EngineActionResult } from '../games/types'
import { firstInvalidGroup, totalGroupValue } from './rules'
import { createTileSet, deal, shuffle, tilePenalty } from './tiles'
import {
  INITIAL_MELD_MINIMUM,
  type RummikubGroup,
  type RummikubTile
} from './types'

export type RummikubStatus = 'playing' | 'finished'

/** Authoritative per-player state. `rack` holds tile ids (hidden from others). */
export interface RummikubServerPlayer {
  playerId: string
  /** Tile ids on this player's rack, in the order the server dealt/added them. */
  rack: string[]
  /** True once the player has laid their qualifying 30-point initial meld. */
  hasOpened: boolean
}

/**
 * Authoritative game state. Contains hidden information: every player's rack and
 * the draw pool order. Never send this to a client — use `getPlayerView`.
 */
export interface RummikubGameState {
  status: RummikubStatus
  playerOrder: string[]
  players: Record<string, RummikubServerPlayer>
  /** Public: groups laid on the table (tile ids only). */
  table: RummikubGroup[]
  /** Hidden: draw pool as tile ids, top of pile at the END (pop to draw). */
  pool: string[]
  /** Immutable registry of every tile in the game, keyed by id. */
  tilesById: Record<string, RummikubTile>
  currentPlayerId: string
  winnerId?: string
  /** Final scores once finished (winner positive, others negative penalties). */
  scores?: Record<string, number>
  /** Monotonic turn counter (used by the client for animation keys). */
  turnCount: number
  /** Id used to mint fresh table-group ids deterministically. */
  groupIdSeq: number
  /**
   * The current player's in-progress, UNCOMMITTED table arrangement, broadcast
   * so opponents can watch them rearrange tiles live. It is not authoritative
   * and is never rule-validated — it is cleared when the turn ends (commit,
   * draw, or disconnect). Only tiles the current player may legally touch
   * (their own rack + the committed table) may appear in it.
   */
  draft?: { playerId: string; table: RummikubGroup[] }
  /** Tile ids newly played onto the table on the most recent committed turn. */
  lastAdded?: string[]
  /** Tile ids already on the table that changed groups on the most recent turn. */
  lastMoved?: string[]
}

export type ActionResult = EngineActionResult<RummikubGameState>

function fail(code: ActionErrorCode, message: string): ActionResult {
  return { ok: false, code, message }
}

function clone(state: RummikubGameState): RummikubGameState {
  return structuredClone(state)
}

function tileIndex(state: RummikubGameState): Map<string, RummikubTile> {
  return new Map(Object.entries(state.tilesById))
}

/** All tile ids currently laid on the table. */
function tableTileIds(table: readonly RummikubGroup[]): string[] {
  return table.flatMap((g) => g.tileIds)
}

/**
 * Create a new game: build the 106-tile bag, shuffle it, deal 14 tiles to each
 * player, keep the rest as the draw pool, start with an empty table, and pick a
 * random starting player.
 */
export function createGame(playerOrder: string[]): RummikubGameState {
  const bag = shuffle(createTileSet())
  const { racks, pool } = deal(bag, playerOrder.length)

  const tilesById: Record<string, RummikubTile> = {}
  for (const tile of bag) tilesById[tile.id] = tile

  const players: Record<string, RummikubServerPlayer> = {}
  playerOrder.forEach((id, i) => {
    players[id] = { playerId: id, rack: racks[i].map((t) => t.id), hasOpened: false }
  })

  const starter = playerOrder[Math.floor(Math.random() * playerOrder.length)]

  return {
    status: 'playing',
    playerOrder: [...playerOrder],
    players,
    table: [],
    pool: pool.map((t) => t.id),
    tilesById,
    currentPlayerId: starter,
    turnCount: 0,
    groupIdSeq: 0
  }
}

function requireTurn(state: RummikubGameState, playerId: string): ActionResult | null {
  if (state.status === 'finished') return fail('GAME_OVER', 'The game has finished.')
  if (!state.players[playerId]) return fail('INVALID_ACTION', 'You are not in this game.')
  if (state.currentPlayerId !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  return null
}

/** Pass control to the next player in seat order. */
function advanceTurn(state: RummikubGameState): void {
  const idx = state.playerOrder.indexOf(state.currentPlayerId)
  const nextIdx = (idx + 1) % state.playerOrder.length
  state.currentPlayerId = state.playerOrder[nextIdx]
  state.turnCount++
  delete state.draft // the previous player's in-progress arrangement is gone
}

/** Sum of the penalty values of a player's remaining rack tiles. */
function rackPenalty(state: RummikubGameState, playerId: string): number {
  const byId = state.tilesById
  return state.players[playerId].rack.reduce((sum, id) => sum + tilePenalty(byId[id]), 0)
}

/**
 * End the game with `winnerId`. Standard scoring: every other player loses the
 * total value of the tiles left on their rack (jokers worth 30); the winner
 * gains the sum of everyone else's penalties.
 */
function finish(state: RummikubGameState, winnerId: string): void {
  state.status = 'finished'
  state.winnerId = winnerId
  delete state.draft
  const scores: Record<string, number> = {}
  let pot = 0
  for (const id of state.playerOrder) {
    if (id === winnerId) continue
    const penalty = rackPenalty(state, id)
    scores[id] = -penalty
    pot += penalty
  }
  scores[winnerId] = pot
  state.scores = scores
}

/** A stable signature for a group, independent of the group's own id. */
function signature(group: RummikubGroup): string {
  return [...group.tileIds].sort().join(',')
}

/**
 * Validate that a player who has not yet opened is making a legal initial meld:
 * they may only add brand-new groups built entirely from their own rack tiles
 * (existing table groups must stay exactly as they were), and those new groups
 * must total at least 30 points. Returns an error message, or null if legal.
 */
function checkInitialMeld(
  proposedTable: readonly RummikubGroup[],
  officialTable: readonly RummikubGroup[],
  playedIds: ReadonlySet<string>,
  byId: ReadonlyMap<string, RummikubTile>
): string | null {
  const officialIds = new Set(tableTileIds(officialTable))
  const newGroups: RummikubGroup[] = []
  const untouched: RummikubGroup[] = []

  for (const group of proposedTable) {
    const hasOfficial = group.tileIds.some((id) => officialIds.has(id))
    const hasPlayed = group.tileIds.some((id) => playedIds.has(id))
    if (hasOfficial && hasPlayed) {
      return 'You cannot add tiles to existing groups until you have opened with 30 points.'
    }
    if (hasPlayed) newGroups.push(group)
    else untouched.push(group)
  }

  // Existing table groups must be preserved exactly — no splitting or combining.
  const before = officialTable.map(signature).sort()
  const after = untouched.map(signature).sort()
  if (before.length !== after.length || before.some((sig, i) => sig !== after[i])) {
    return 'You cannot rearrange tiles already on the table until you have opened.'
  }

  const meld = totalGroupValue(newGroups, byId)
  if (meld < INITIAL_MELD_MINIMUM) {
    return `Your first play must total at least ${INITIAL_MELD_MINIMUM} points (this one is ${meld}).`
  }
  return null
}

/**
 * Commit a whole proposed end-of-turn state: the full table and the player's
 * remaining rack. Validates conservation, ownership, group legality and (before
 * opening) the initial meld, then either declares a winner or advances the turn.
 */
export function finishTurn(
  state: RummikubGameState,
  playerId: string,
  proposedTable: RummikubGroup[],
  proposedRack: string[]
): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard

  const byId = tileIndex(state)
  const player = state.players[playerId]
  const officialRack = player.rack
  const officialRackSet = new Set(officialRack)
  const officialAll = new Set<string>([...officialRack, ...tableTileIds(state.table)])

  const proposedTableIds = tableTileIds(proposedTable)
  const allProposed = [...proposedTableIds, ...proposedRack]

  // 1. Every proposed id must be a real tile in this game (no invented/fake tiles).
  for (const id of allProposed) {
    if (!byId.has(id)) return fail('INVALID_ACTION', 'That move references an unknown tile.')
  }

  // 2. No tile may appear twice across the whole proposal (no duplication).
  const seen = new Set<string>()
  for (const id of allProposed) {
    if (seen.has(id)) return fail('INVALID_ACTION', 'A tile cannot be in two places at once.')
    seen.add(id)
  }

  // 3. Conservation: the proposal must account for exactly the tiles the player
  //    started the turn with (their rack) plus the tiles already on the table —
  //    no more, no fewer.
  if (seen.size !== officialAll.size) {
    return fail('INVALID_ACTION', 'Tiles were lost or added illegally.')
  }
  for (const id of seen) {
    if (!officialAll.has(id)) {
      return fail('INVALID_ACTION', 'You can only move your own rack tiles and tiles on the table.')
    }
  }

  // 4. Ownership: tiles kept in hand must have started in hand — you may never
  //    pull a tile off the table back onto your rack (this also forces a joker
  //    freed from the table to be used this turn, not hoarded).
  const proposedRackSet = new Set(proposedRack)
  for (const id of proposedRack) {
    if (!officialRackSet.has(id)) {
      return fail('INVALID_ACTION', 'You cannot take tiles from the table onto your rack.')
    }
  }

  // 5. A turn that plays no new tile is not a valid finish — draw instead.
  const playedIds = new Set(officialRack.filter((id) => !proposedRackSet.has(id)))
  if (playedIds.size === 0) {
    return fail('INVALID_ACTION', 'Play at least one tile from your rack, or draw a tile.')
  }

  // 6. Every resulting group must be a legal run or set of 3+ tiles.
  if (firstInvalidGroup(proposedTable, byId) !== null) {
    return fail(
      'INVALID_ACTION',
      'Every group on the table must be a valid run or set of at least 3 tiles.'
    )
  }

  // 7. Initial meld requirement, if the player has not opened yet.
  if (!player.hasOpened) {
    const meldError = checkInitialMeld(proposedTable, state.table, playedIds, byId)
    if (meldError) return fail('INVALID_ACTION', meldError)
  }

  // --- Commit ---------------------------------------------------------------
  const next = clone(state)
  // Re-id groups deterministically so the client always gets stable keys and we
  // never trust client-supplied group ids.
  next.table = proposedTable.map((g) => ({ id: `g${next.groupIdSeq++}`, tileIds: [...g.tileIds] }))
  const nextPlayer = next.players[playerId]
  nextPlayer.rack = [...proposedRack]
  if (!nextPlayer.hasOpened) nextPlayer.hasOpened = true

  // Track what changed this turn so the UI can flag it: a tile is "added" if it
  // came from the rack, "moved" if it was already on the table and its set of
  // pre-existing group-mates changed (it was split off or merged in). Simply
  // extending a group with new tiles does NOT mark the untouched tiles.
  const membersOf = (table: readonly RummikubGroup[]): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>()
    for (const g of table) {
      const members = new Set(g.tileIds)
      for (const id of g.tileIds) m.set(id, members)
    }
    return m
  }
  const preexisting = new Set(state.table.flatMap((g) => g.tileIds))
  const oldMembers = membersOf(state.table)
  const newMembers = membersOf(next.table)
  const added: string[] = []
  const moved: string[] = []
  for (const [id, group] of newMembers) {
    if (!preexisting.has(id)) {
      added.push(id)
      continue
    }
    const oldMates = [...(oldMembers.get(id) ?? [])].filter((x) => x !== id)
    const newMates = new Set([...group].filter((x) => x !== id && preexisting.has(x)))
    if (oldMates.length !== newMates.size || oldMates.some((x) => !newMates.has(x))) {
      moved.push(id)
    }
  }
  next.lastAdded = added
  next.lastMoved = moved

  if (nextPlayer.rack.length === 0) {
    finish(next, playerId)
  } else {
    advanceTurn(next)
  }
  return { ok: true, state: next }
}

/**
 * Draw one tile from the pool onto the player's rack and end their turn. If the
 * pool is empty, the turn simply passes (a clean no-tile pass). Drawing never
 * wins the game and never lets the player also make a play this turn.
 */
export function drawTile(state: RummikubGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const next = clone(state)
  if (next.pool.length > 0) {
    const id = next.pool.pop() as string
    next.players[playerId].rack.push(id)
  }
  // A draw changes nothing on the table, so clear last-turn change markers.
  next.lastAdded = []
  next.lastMoved = []
  advanceTurn(next)
  return { ok: true, state: next }
}

/**
 * Remove a player mid-game (disconnect/leave). Their unused rack tiles go back
 * into the draw pool (reshuffled so they stay hidden). If it was their turn,
 * play advances to the next seat; if only one player remains, they win. Returns
 * null if nobody is left.
 */
export function removePlayerFromGame(
  state: RummikubGameState,
  playerId: string
): RummikubGameState | null {
  if (!state.playerOrder.includes(playerId)) return state
  const next = clone(state)

  const leaving = next.players[playerId]
  if (leaving) next.pool = shuffle([...next.pool, ...leaving.rack])
  if (next.draft && next.draft.playerId === playerId) delete next.draft

  const wasCurrent = next.currentPlayerId === playerId
  const idx = next.playerOrder.indexOf(playerId)
  next.playerOrder.splice(idx, 1)
  delete next.players[playerId]

  if (next.playerOrder.length === 0) return null
  if (next.status === 'finished') return next

  if (next.playerOrder.length === 1) {
    finish(next, next.playerOrder[0])
    return next
  }

  if (wasCurrent) {
    // The seat that shifted into `idx` takes the turn (wrapping at the end).
    next.currentPlayerId = next.playerOrder[idx % next.playerOrder.length]
    next.turnCount++
  }
  return next
}

/**
 * Record the current player's in-progress table arrangement so opponents can
 * watch it live. This is NOT a committed move: it is not rule-validated (the
 * arrangement may be mid-edit and invalid) and does not advance the turn. It
 * only enforces that every referenced tile is one the current player may
 * legally touch — their own rack tiles and tiles already on the committed table
 * — so it can never leak an opponent's hidden rack or invent tiles.
 */
export function setPreview(
  state: RummikubGameState,
  playerId: string,
  table: RummikubGroup[]
): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard

  const byId = tileIndex(state)
  const allowed = new Set<string>([...state.players[playerId].rack, ...tableTileIds(state.table)])
  const seen = new Set<string>()
  for (const group of table) {
    for (const id of group.tileIds) {
      if (!byId.has(id) || !allowed.has(id) || seen.has(id)) {
        return fail('INVALID_ACTION', 'Illegal preview arrangement.')
      }
      seen.add(id)
    }
  }

  const next = clone(state)
  next.draft = { playerId, table: table.map((g) => ({ id: g.id, tileIds: [...g.tileIds] })) }
  return { ok: true, state: next }
}

/** Clear the current player's in-progress arrangement (e.g. on Cancel). */
export function clearPreview(state: RummikubGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  if (!state.draft) return { ok: true, state }
  const next = clone(state)
  delete next.draft
  return { ok: true, state: next }
}
