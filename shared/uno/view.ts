/**
 * Client-facing (sanitized) UNO types and the state serializer.
 *
 * SECURITY: the authoritative {@link UnoGameState} contains the full draw-pile
 * order and EVERY player's hand. A client must never receive another player's
 * cards or the deck order. {@link getPlayerView} is the single choke point that
 * strips hidden information — the renderer only ever sees a {@link UnoView},
 * which carries the recipient's own hand plus public table state (top card,
 * active colour, direction, and per-player card COUNTS only).
 *
 * `shared/uno/view.test.ts` guards this: it asserts no opponent card ids/values
 * appear anywhere in a serialized view, and that the draw pile is never sent.
 */
import { topCard, playableCardIds, type UnoGameState, type UnoStackType } from './engine'
import type { UnoCard, UnoColor } from './cards'

/** Public per-player summary (no hand — only a count and UNO status). */
export interface UnoPlayerView {
  playerId: string
  isSelf: boolean
  cardCount: number
  /** True once the player safely declared UNO at one card. */
  saidUno: boolean
  /** True while the player is at one card and catchable for a missed UNO call. */
  catchable: boolean
}

export interface UnoView {
  status: UnoGameState['status']
  selfId: string
  players: UnoPlayerView[]
  /** The local player's OWN hand (the only hand ever serialized to them). */
  hand: UnoCard[]
  topCard: UnoCard
  activeColor: UnoColor
  /** House rule: whether Draw Two / Wild Draw Four penalties may be stacked. */
  stacking: boolean
  /** Accumulated draw penalty owed to the player under a stack (0 when none). */
  pendingDraw: number
  pendingDrawType: UnoStackType
  /** It's your turn and a stack is pending — you must stack or draw the penalty. */
  mustRespondToStack: boolean
  direction: UnoGameState['direction']
  currentPlayerId: string
  /** Set while a wild's colour is being chosen. */
  pendingColorPlayerId?: string
  drawPileCount: number
  discardCount: number
  yourTurn: boolean
  /** You must choose a colour for a wild you just played. */
  mustChooseColor: boolean
  /** Card ids in your hand that are legal to play now (UX only; server-enforced). */
  playableCardIds: string[]
  /** You have drawn a playable card and may play it or pass. */
  drawnCardId?: string
  /** You may draw a card right now. */
  canDraw: boolean
  /** You may pass (only after drawing a playable card). */
  canPass: boolean
  /** You may declare UNO right now (at one card, not yet declared). */
  canCallUno: boolean
  /** Opponent player ids you may currently catch for a missed UNO call. */
  catchableOpponentIds: string[]
  winnerId?: string
  lastEvent?: string
}

export interface UnoResults {
  winnerId?: string
}

/**
 * Produce the safe, player-specific view. Only `playerId`'s own hand is included;
 * every other player is reduced to a card count and UNO status. The draw pile and
 * the buried discards are never serialized.
 */
export function getPlayerView(state: UnoGameState, playerId: string): UnoView {
  const self = state.players[playerId]
  const yourTurn = state.status === 'playing' && state.currentPlayerId === playerId
  const mustChooseColor =
    state.status === 'choosing_color' && state.pendingColorPlayerId === playerId

  const players: UnoPlayerView[] = state.playerOrder.map((id) => {
    const p = state.players[id]
    return {
      playerId: id,
      isSelf: id === playerId,
      cardCount: p.hand.length,
      saidUno: p.saidUno,
      catchable: p.hand.length === 1 && p.unoPenaltyPending
    }
  })

  const catchableOpponentIds = state.playerOrder.filter(
    (id) => id !== playerId && state.players[id].hand.length === 1 && state.players[id].unoPenaltyPending
  )

  const drawn = yourTurn ? state.drawnCardId : undefined

  return {
    status: state.status,
    selfId: playerId,
    players,
    hand: self ? self.hand : [],
    topCard: topCard(state),
    activeColor: state.activeColor,
    stacking: state.stacking,
    pendingDraw: state.pendingDraw,
    pendingDrawType: state.pendingDrawType,
    mustRespondToStack: yourTurn && state.pendingDraw > 0,
    direction: state.direction,
    currentPlayerId: state.currentPlayerId,
    pendingColorPlayerId: state.pendingColorPlayerId,
    drawPileCount: state.drawPile.length,
    discardCount: state.discardPile.length,
    yourTurn,
    mustChooseColor,
    playableCardIds: playableCardIds(state, playerId),
    drawnCardId: drawn,
    canDraw: yourTurn && !state.drawnCardId,
    canPass: yourTurn && !!state.drawnCardId,
    canCallUno: !!self && self.hand.length === 1 && !self.saidUno && state.status !== 'finished',
    catchableOpponentIds,
    winnerId: state.winnerId,
    lastEvent: state.lastEvent
  }
}

export function getResults(state: UnoGameState): UnoResults {
  return { winnerId: state.winnerId }
}
