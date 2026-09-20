/**
 * Client-facing (sanitized) Rummikub types and the state serializer.
 *
 * SECURITY: the authoritative {@link RummikubGameState} holds every player's
 * rack and the full draw-pool order. {@link getPlayerView} is the single choke
 * point that strips hidden information: a client receives its OWN rack tiles and
 * the public table, plus only a *count* of every opponent's rack and the pool.
 * Opponents' tiles are not serialized at all (never sent-and-hidden-with-CSS).
 */
import { INITIAL_MELD_MINIMUM, type RummikubGroup, type RummikubTile } from './types'
import type { RummikubGameState, RummikubStatus } from './engine'

/** Public per-player info (never the tiles themselves for other players). */
export interface RummikubPlayerView {
  playerId: string
  isSelf: boolean
  /** How many tiles are on this player's rack. */
  tileCount: number
  hasOpened: boolean
  /** True when it is this player's turn. */
  isCurrent: boolean
}

export interface RummikubView {
  status: RummikubStatus
  selfId: string
  currentPlayerId: string
  yourTurn: boolean
  /** Public groups on the table (tile ids). */
  table: RummikubGroup[]
  /** Tiles the client may see: its own rack tiles and every tile on the table. */
  tiles: Record<string, RummikubTile>
  /** The local player's rack, in server order (the client re-orders locally). */
  rack: RummikubTile[]
  players: RummikubPlayerView[]
  poolCount: number
  /** Monotonic turn counter — the client resets local edits when it changes. */
  turnCount: number
  /**
   * Set (for spectators only) to the id of the player who is currently
   * rearranging the table. When present, {@link table} is that player's live,
   * uncommitted arrangement — watch it change in real time.
   */
  previewBy?: string
  /** Tile ids newly played onto the table on the most recent turn (flag green). */
  lastAdded: string[]
  /** Tile ids already on the table that moved groups last turn (flag orange). */
  lastMoved: string[]
  /** Whether the local player has already laid their initial meld. */
  selfHasOpened: boolean
  /** Minimum value for a first meld (30), surfaced for the UI. */
  initialMeldRequirement: number
  winnerId?: string
  scores?: Record<string, number>
}

export interface RummikubResults {
  winnerId?: string
  scores?: Record<string, number>
}

export function getPlayerView(state: RummikubGameState, playerId: string): RummikubView {
  const self = state.players[playerId]

  // Only tiles the player may see: the public table plus the player's own rack.
  // Spectators see the current player's live, uncommitted arrangement; the
  // player doing the rearranging (and everyone once no draft exists) sees the
  // authoritative committed table.
  const showDraft = !!state.draft && state.draft.playerId !== playerId
  const activeTable = showDraft ? state.draft!.table : state.table

  const tiles: Record<string, RummikubTile> = {}
  for (const group of activeTable) {
    for (const id of group.tileIds) {
      const tile = state.tilesById[id]
      if (tile) tiles[id] = tile
    }
  }
  const rack: RummikubTile[] = []
  if (self) {
    for (const id of self.rack) {
      const tile = state.tilesById[id]
      tiles[id] = tile
      rack.push(tile)
    }
  }

  const players: RummikubPlayerView[] = state.playerOrder.map((id) => {
    const p = state.players[id]
    return {
      playerId: id,
      isSelf: id === playerId,
      tileCount: p.rack.length,
      hasOpened: p.hasOpened,
      isCurrent: state.currentPlayerId === id
    }
  })

  return {
    status: state.status,
    selfId: playerId,
    currentPlayerId: state.currentPlayerId,
    yourTurn: state.status === 'playing' && state.currentPlayerId === playerId,
    table: activeTable.map((g) => ({ id: g.id, tileIds: [...g.tileIds] })),
    tiles,
    rack,
    players,
    poolCount: state.pool.length,
    turnCount: state.turnCount,
    previewBy: showDraft ? state.draft!.playerId : undefined,
    lastAdded: state.lastAdded ?? [],
    lastMoved: state.lastMoved ?? [],
    selfHasOpened: self?.hasOpened ?? false,
    initialMeldRequirement: INITIAL_MELD_MINIMUM,
    winnerId: state.winnerId,
    scores: state.scores
  }
}

export function getResults(state: RummikubGameState): RummikubResults {
  return { winnerId: state.winnerId, scores: state.scores }
}
