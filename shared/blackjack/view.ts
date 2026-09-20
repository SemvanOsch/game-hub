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
 * hand(s) appear in the view — only the dealer's hole card and the deck are secret.
 */
import { calculateHandValue, handTotal, isBust, type Card, type CardOrHidden } from './cards'
import {
  canDoubleHand,
  canSplitHand,
  isNaturalBlackjack,
  type BlackjackGameState,
  type BlackjackHandStatus,
  type BlackjackPlayerStatus
} from './engine'
import { unitsToChips, type HandOutcome } from './rules'

/** Public per-hand view (chips/bets are in whole chips, possibly fractional). */
export interface BlackjackHandView {
  id: string
  cards: Card[]
  /** Chips committed to this hand. */
  bet: number
  /** Best hand total; 0 before any cards are dealt. */
  total: number
  soft: boolean
  status: BlackjackHandStatus
  doubled: boolean
  fromSplit: boolean
  /** True only for a NATURAL Blackjack (unsplit two-card 21). */
  isBlackjack: boolean
  /** True when this is the hand its owner is actively playing right now. */
  isActive: boolean
  lastResult?: HandOutcome
}

/** Public per-player view. A player has one hand normally, more after splitting. */
export interface BlackjackPlayerView {
  playerId: string
  isSelf: boolean
  /** Uncommitted chips. */
  chips: number
  status: BlackjackPlayerStatus
  hands: BlackjackHandView[]
  activeHandIndex: number
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
  /** Actions the local player may take on their ACTIVE hand right now (also
   *  enforced server-side). */
  canHit: boolean
  canStand: boolean
  canDouble: boolean
  canSplit: boolean
  /** True in the between-hands phase, when the next hand can be started. */
  canStartNextHand: boolean
  /** True in the match-over review phase, when the final result can be dismissed
   *  to reveal the game-over screen. Available to every player, eliminated or not. */
  canFinishMatch: boolean
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

  const players = state.playerOrder.map((id) => buildPlayerView(state, id, playerId))

  const self = state.players[playerId]
  const yourTurn = state.status === 'player_turns' && state.currentPlayerId === playerId
  const canAct = yourTurn && self?.status === 'playing'
  const activeHand = self ? self.hands[self.activeHandIndex] : undefined
  const handActable = canAct && !!activeHand && activeHand.status === 'playing'

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
    canHit: handActable && !activeHand!.splitAce,
    canStand: handActable,
    canDouble: canAct && !!self && !!activeHand && canDoubleHand(self, activeHand),
    canSplit: canAct && !!self && !!activeHand && canSplitHand(self, activeHand),
    canStartNextHand: state.status === 'hand_over' && self?.status !== 'eliminated',
    canFinishMatch: state.status === 'match_over'
  }
}

function buildPlayerView(
  state: BlackjackGameState,
  id: string,
  selfId: string
): BlackjackPlayerView {
  const p = state.players[id]
  const isTurn = state.status === 'player_turns' && state.currentPlayerId === id

  const hands: BlackjackHandView[] = p.hands.map((h, i) => {
    const { total, soft } = calculateHandValue(h.cards)
    return {
      id: h.id,
      cards: h.cards,
      bet: unitsToChips(h.bet),
      total: h.cards.length ? total : 0,
      soft,
      status: h.status,
      doubled: h.doubled,
      fromSplit: h.fromSplit,
      isBlackjack: isNaturalBlackjack(h),
      isActive: isTurn && p.status === 'playing' && i === p.activeHandIndex,
      lastResult: h.lastResult
    }
  })

  return {
    playerId: id,
    isSelf: id === selfId,
    chips: unitsToChips(p.chips),
    status: p.status,
    hands,
    activeHandIndex: p.activeHandIndex
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
