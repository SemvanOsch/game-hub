/**
 * Client-facing (sanitized) Skip-Bo types and the state serializer.
 *
 * SECURITY: the authoritative {@link SkipBoGameState} contains the full draw-pile
 * order, the completed reservoir, and EVERY player's stock and hand. A client
 * must never receive another player's hidden cards or the deck order.
 * {@link getPlayerView} is the single choke point that strips hidden information:
 *   - a player's own HAND is the only hand ever serialized to them
 *   - stockpiles reveal only the TOP card + a count (even the owner cannot see
 *     their own buried stock — that is the whole game)
 *   - discard piles reveal only their TOP card + a count
 *   - the draw pile and completed reservoir are reduced to counts
 * `shared/skipbo/view.test.ts` guards this.
 */
import type { BuildingCard, SkipBoCard } from './cards'
import type { SkipBoGameState, SkipBoPlayerStats } from './engine'

/** Public per-player summary. No hand, no buried stock/discards — counts only. */
export interface SkipBoPlayerView {
  playerId: string
  isSelf: boolean
  handCount: number
  stockCount: number
  /** Top (only visible) card of the stockpile, or null when empty. */
  stockTop: SkipBoCard | null
  /** Top card of each of the four discard piles (null for an empty pile). */
  discardTops: (SkipBoCard | null)[]
  discardCounts: number[]
  stats: SkipBoPlayerStats
}

/** Public building-pile summary: its top card + how many cards it holds. */
export interface BuildingPileView {
  topCard: BuildingCard | null
  count: number
  /** The value this pile next requires (1–12). */
  required: number
}

export interface SkipBoView {
  status: SkipBoGameState['status']
  /** The match length chosen in the lobby (long = larger stockpiles). */
  gameLength: SkipBoGameState['gameLength']
  selfId: string
  /** Players in seat order. */
  players: SkipBoPlayerView[]
  /** The local player's OWN hand (the only hand ever serialized to them). */
  hand: SkipBoCard[]
  buildingPiles: BuildingPileView[]
  drawPileCount: number
  completedCount: number
  currentPlayerId: string
  yourTurn: boolean
  turnNumber: number
  /** Epoch-ms the current turn began. */
  turnStartedAt: number
  /** Epoch-ms at which the current turn times out. */
  turnDeadline: number
  /** The server's clock at serialization time, for client countdown calibration. */
  serverNow: number
  winnerId?: string
  lastEvent?: string
}

export interface SkipBoResults {
  winnerId?: string
  /** Per-player final stats keyed by player id (for the results screen). */
  stats: Record<string, SkipBoPlayerStats>
  /** Stock cards each player had left at game end (winner has 0). */
  stockLeft: Record<string, number>
}

/**
 * Produce the safe, player-specific view. Only `playerId`'s own hand is included;
 * every other player is reduced to public counts and visible tops. The draw pile
 * and completed reservoir are never serialized beyond their counts.
 */
export function getPlayerView(state: SkipBoGameState, playerId: string): SkipBoView {
  const self = state.players[playerId]

  const players: SkipBoPlayerView[] = state.playerOrder.map((id) => {
    const p = state.players[id]
    return {
      playerId: id,
      isSelf: id === playerId,
      handCount: p.hand.length,
      stockCount: p.stock.length,
      stockTop: p.stock.length > 0 ? p.stock[p.stock.length - 1] : null,
      discardTops: p.discards.map((pile) => (pile.length > 0 ? pile[pile.length - 1] : null)),
      discardCounts: p.discards.map((pile) => pile.length),
      stats: state.stats[id]
    }
  })

  const buildingPiles: BuildingPileView[] = state.buildingPiles.map((pile) => ({
    topCard: pile.length > 0 ? pile[pile.length - 1] : null,
    count: pile.length,
    required: pile.length + 1
  }))

  return {
    status: state.status,
    gameLength: state.gameLength,
    selfId: playerId,
    players,
    hand: self ? [...self.hand] : [],
    buildingPiles,
    drawPileCount: state.drawPile.length,
    completedCount: state.completed.length,
    currentPlayerId: state.currentPlayerId,
    yourTurn: state.status === 'playing' && state.currentPlayerId === playerId,
    turnNumber: state.turnNumber,
    turnStartedAt: state.turnStartedAt,
    turnDeadline: state.turnDeadline,
    serverNow: Date.now(),
    winnerId: state.winnerId,
    lastEvent: state.lastEvent
  }
}

export function getResults(state: SkipBoGameState): SkipBoResults {
  const stockLeft: Record<string, number> = {}
  for (const id of state.playerOrder) {
    stockLeft[id] = state.players[id]?.stock.length ?? 0
  }
  return { winnerId: state.winnerId, stats: state.stats, stockLeft }
}
