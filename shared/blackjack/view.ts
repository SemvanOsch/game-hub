/**
 * Client-facing (sanitized) Blackjack types and the state serializer.
 *
 * SECURITY: the authoritative {@link BlackjackGameState} contains the full deck
 * order and the dealer's face-down hole card. A client must NEVER receive those
 * before they are revealed. {@link getPlayerView} is the single choke point that
 * strips hidden information — the renderer only ever sees a {@link BlackjackView}.
 * The hidden hole card is replaced by a `{ hidden: true }` placeholder; its real
 * suit/rank is not serialized at all (never sent-and-hidden-with-CSS).
 *
 * Player hands are public once dealt (normal table Blackjack), so every player's
 * cards appear in the view — only the dealer's hole card and the deck are secret.
 */
import { calculateHandValue, handTotal, isBust, type Card, type CardOrHidden } from './cards'
import { canDoubleDown, type BlackjackGameState, type BlackjackPlayerStatus } from './engine'
import { unitsToChips, type HandOutcome } from './rules'

/** Public per-player view (chips/bets are in whole chips, possibly fractional). */
export interface BlackjackPlayerView {
  playerId: string
  isSelf: boolean
  chips: number
  bet: number
  cards: Card[]
  /** Best hand total; 0 before any cards are dealt. */
  total: number
  soft: boolean
  status: BlackjackPlayerStatus
  lastResult?: HandOutcome
  doubled: boolean
}

export interface DealerView {
  /** Cards with the hole card hidden until revealed. */
  cards: CardOrHidden[]
  /** Total of the cards the client can see (full total once revealed). */
  visibleTotal: number
  revealed: boolean
  busted: boolean
  blackjack: boolean
}

export interface BlackjackView {
  status: BlackjackGameState['status']
  selfId: string
  handNumber: number
  currentPlayerId?: string
  yourTurn: boolean
  dealer: DealerView
  players: BlackjackPlayerView[]
  winnerId?: string
  lastEvent?: string
  /** Actions the local player may take right now (also enforced server-side). */
  canHit: boolean
  canStand: boolean
  canDouble: boolean
  /** True in the between-hands phase, when the next hand can be started. */
  canStartNextHand: boolean
}

export interface BlackjackResults {
  winnerId?: string
}

/**
 * Produce the safe, player-specific view. The dealer's hole card is omitted
 * (replaced by a placeholder) until {@link BlackjackGameState.dealerRevealed}.
 */
export function getPlayerView(state: BlackjackGameState, playerId: string): BlackjackView {
  const dealer = buildDealerView(state)

  const players: BlackjackPlayerView[] = state.playerOrder.map((id) => {
    const p = state.players[id]
    const { total, soft } = calculateHandValue(p.cards)
    return {
      playerId: id,
      isSelf: id === playerId,
      chips: unitsToChips(p.chips),
      bet: unitsToChips(p.bet),
      cards: p.cards,
      total: p.cards.length ? total : 0,
      soft,
      status: p.status,
      lastResult: p.lastResult,
      doubled: p.doubled
    }
  })

  const self = state.players[playerId]
  const yourTurn = state.status === 'player_turns' && state.currentPlayerId === playerId
  const canAct = yourTurn && self?.status === 'playing'

  return {
    status: state.status,
    selfId: playerId,
    handNumber: state.handNumber,
    currentPlayerId: state.currentPlayerId,
    yourTurn,
    dealer,
    players,
    winnerId: state.winnerId,
    lastEvent: state.lastEvent,
    canHit: canAct,
    canStand: canAct,
    canDouble: canAct && !!self && canDoubleDown(self),
    canStartNextHand: state.status === 'hand_over' && self?.status !== 'eliminated'
  }
}

function buildDealerView(state: BlackjackGameState): DealerView {
  const revealed = state.dealerRevealed
  if (revealed) {
    return {
      cards: state.dealerCards,
      visibleTotal: handTotal(state.dealerCards),
      revealed: true,
      busted: isBust(state.dealerCards),
      blackjack: state.dealerCards.length === 2 && handTotal(state.dealerCards) === 21
    }
  }
  // Only the up card is known to clients; the hole card is a placeholder and any
  // further cards do not exist yet before reveal.
  const upCard = state.dealerCards[0]
  const cards: CardOrHidden[] = upCard ? [upCard, { hidden: true }] : []
  return {
    cards,
    visibleTotal: upCard ? handTotal([upCard]) : 0,
    revealed: false,
    busted: false,
    blackjack: false
  }
}

export function getResults(state: BlackjackGameState): BlackjackResults {
  return { winnerId: state.winnerId }
}
