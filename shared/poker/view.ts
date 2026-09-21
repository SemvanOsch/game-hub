/**
 * Client-facing (sanitized) poker types and the state serializer.
 *
 * SECURITY: the authoritative {@link PokerGameState} holds the undealt deck and
 * EVERY player's hole cards. {@link getPlayerView} is the single choke point that
 * strips hidden information — a client only ever receives a {@link PokerView}.
 * Opponents' hole cards are replaced by `{ hidden: true }` placeholders and their
 * real suit/rank are not serialized at all (never sent-and-hidden-with-CSS),
 * except for contenders whose cards are legitimately revealed at showdown.
 */
import type { Card, CardOrHidden } from '../blackjack/cards'
import { describeHand, getBestFiveCardHand, rankValue } from './handEval'
import { calculateSidePots, type PlayerContribution } from './sidePots'
import {
  potTotal,
  type HandSummary,
  type PokerActionKind,
  type PokerActionLogEntry,
  type PokerGameState,
  type PokerPhase,
  type PokerStatus,
  type PokerWinReason
} from './engine'

/** Public per-player view. Hole cards are self-only until a showdown reveal. */
export interface PokerPlayerView {
  playerId: string
  isSelf: boolean
  chips: number
  /** Chips committed in the current betting round (in front of the player). */
  bet: number
  totalBet: number
  folded: boolean
  allIn: boolean
  eliminated: boolean
  left: boolean
  isDealer: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  isCurrent: boolean
  hasCards: boolean
  /** Self: real cards. Others: hidden placeholders, or real cards at showdown. */
  holeCards: CardOrHidden[]
  lastAction?: PokerActionKind
  /** Hand label for a player revealed at showdown. */
  handLabel?: string
  /** The best five cards, for highlighting a revealed hand. */
  bestCards?: Card[]
  /** Chips won in the just-completed hand (for the hand_over display). */
  winnings?: number
}

export interface PokerPotView {
  amount: number
  eligiblePlayerIds: string[]
}

/** Legal actions for the local player right now (also enforced server-side). */
export interface LegalActions {
  canFold: boolean
  canCheck: boolean
  canCall: boolean
  /** Chips required to call (capped at the player's stack). */
  callAmount: number
  canBet: boolean
  canRaise: boolean
  /** Min / max TOTAL round-bet for an opening bet. */
  minBet: number
  maxBet: number
  /** Min / max "raise to" TOTAL round-bet. */
  minRaise: number
  maxRaise: number
  canAllIn: boolean
  /** The total round-bet a shove would reach. */
  allInAmount: number
}

const NO_ACTIONS: LegalActions = {
  canFold: false,
  canCheck: false,
  canCall: false,
  callAmount: 0,
  canBet: false,
  canRaise: false,
  minBet: 0,
  maxBet: 0,
  minRaise: 0,
  maxRaise: 0,
  canAllIn: false,
  allInAmount: 0
}

export interface PokerView {
  status: PokerStatus
  phase: PokerPhase
  selfId: string
  handNumber: number
  currentPlayerId?: string
  yourTurn: boolean
  dealerId?: string
  smallBlindId?: string
  bigBlindId?: string
  communityCards: Card[]
  players: PokerPlayerView[]
  /** Total chips across all pots. */
  pot: number
  /** Side-pot breakdown (length > 1 only when side pots exist). */
  pots: PokerPotView[]
  currentBet: number
  minRaise: number
  smallBlind: number
  bigBlind: number
  startingChips: number
  targetChips: number
  legal: LegalActions
  /** True in the between-hands phase, when the next hand can be dealt. */
  canStartNextHand: boolean
  /** True in the match-over review phase, when the final result can be dismissed
   *  to reveal the game-over screen. Available to every player. */
  canFinishMatch: boolean
  lastHand?: HandSummary
  actionLog: PokerActionLogEntry[]
  winnerId?: string
  winReason?: PokerWinReason
  /** The local player's current best-hand label (display only). */
  selfBestHand?: string
}

export interface PokerResults {
  winnerId?: string
  winReason?: PokerWinReason
}

/** Which seats hold the button and blinds this hand (recomputed from state). */
function blindSeats(state: PokerGameState): {
  dealerId?: string
  sbId?: string
  bbId?: string
} {
  const order = state.playerOrder
  const seated = order.filter((id) => !state.players[id].eliminated && !state.players[id].left)
  if (seated.length === 0) return {}
  const dealerId = order[state.dealerIndex]
  const nextSeated = (fromIdx: number): string => {
    const n = order.length
    for (let i = 1; i <= n; i++) {
      const p = state.players[order[(fromIdx + i) % n]]
      if (!p.eliminated && !p.left) return p.id
    }
    return order[fromIdx]
  }
  if (seated.length === 2) {
    return { dealerId, sbId: dealerId, bbId: nextSeated(state.dealerIndex) }
  }
  const sbId = nextSeated(state.dealerIndex)
  const bbId = nextSeated(state.playerOrder.indexOf(sbId))
  return { dealerId, sbId, bbId }
}

/**
 * The legal actions for a player right now. Pure and reusable; the reducers
 * enforce the same rules authoritatively, so this is safe to expose in the view.
 */
export function getLegalActions(state: PokerGameState, playerId: string): LegalActions {
  const p = state.players[playerId]
  if (
    !p ||
    state.status !== 'playing' ||
    state.currentPlayerId !== playerId ||
    p.folded ||
    p.allIn ||
    p.eliminated ||
    p.left
  ) {
    return NO_ACTIONS
  }

  const toCall = state.currentBet - p.bet
  const maxTarget = p.bet + p.chips
  const canCheck = toCall === 0
  const canCall = toCall > 0 && p.chips > 0
  const canBet = state.currentBet === 0 && p.chips > 0
  const canRaise = state.currentBet > 0 && p.chips > toCall

  return {
    canFold: true,
    canCheck,
    canCall,
    callAmount: Math.min(toCall, p.chips),
    canBet,
    canRaise,
    minBet: Math.min(state.bigBlind, maxTarget),
    maxBet: maxTarget,
    minRaise: Math.min(state.currentBet + state.minRaise, maxTarget),
    maxRaise: maxTarget,
    canAllIn: p.chips > 0,
    allInAmount: maxTarget
  }
}

/** A light preflop label for the local player's two hole cards. */
function preflopLabel(cards: Card[]): string | undefined {
  if (cards.length !== 2) return undefined
  const a = rankValue(cards[0].rank)
  const b = rankValue(cards[1].rank)
  if (a === b) return `Pocket ${cards[0].rank}s`
  const hi = a > b ? cards[0].rank : cards[1].rank
  const lo = a > b ? cards[1].rank : cards[0].rank
  const suited = cards[0].suit === cards[1].suit ? ' suited' : ''
  return `${hi}-${lo}${suited}`
}

/** Produce the safe, player-specific view. */
export function getPlayerView(state: PokerGameState, playerId: string): PokerView {
  const { dealerId, sbId, bbId } = blindSeats(state)
  const showdownReveal = state.lastHand?.showdown ? state.lastHand.revealed : []
  const revealedById = new Map(showdownReveal.map((r) => [r.playerId, r]))
  const winnings = state.lastHand?.winnings ?? {}

  const players: PokerPlayerView[] = state.playerOrder.map((id) => {
    const p = state.players[id]
    const isSelf = id === playerId
    const revealed = revealedById.get(id)

    let holeCards: CardOrHidden[]
    if (isSelf) {
      holeCards = [...p.holeCards]
    } else if (revealed) {
      holeCards = [...revealed.holeCards]
    } else if (p.holeCards.length > 0 && !p.folded && !p.left) {
      holeCards = p.holeCards.map(() => ({ hidden: true }))
    } else {
      holeCards = []
    }

    return {
      playerId: id,
      isSelf,
      chips: p.chips,
      bet: p.bet,
      totalBet: p.totalBet,
      folded: p.folded,
      allIn: p.allIn,
      eliminated: p.eliminated,
      left: p.left,
      isDealer: id === dealerId,
      isSmallBlind: id === sbId,
      isBigBlind: id === bbId,
      isCurrent: state.currentPlayerId === id,
      hasCards: p.holeCards.length > 0,
      holeCards,
      lastAction: p.lastAction,
      handLabel: revealed?.label,
      bestCards: revealed?.bestCards,
      winnings: winnings[id]
    }
  })

  // Side-pot breakdown from current contributions (for live + showdown display).
  const contributions: PlayerContribution[] = state.playerOrder.map((id) => {
    const p = state.players[id]
    return { playerId: id, contributed: p.totalBet, folded: p.folded || p.eliminated || p.left }
  })
  const pots: PokerPotView[] = calculateSidePots(contributions).map((pot) => ({
    amount: pot.amount,
    eligiblePlayerIds: pot.eligiblePlayerIds
  }))

  const self = state.players[playerId]
  const yourTurn = state.status === 'playing' && state.currentPlayerId === playerId

  let selfBestHand: string | undefined
  if (self && self.holeCards.length > 0 && !self.folded) {
    const combined = [...self.holeCards, ...state.communityCards]
    if (combined.length >= 5) {
      selfBestHand = describeHand(getBestFiveCardHand(combined))
    } else {
      selfBestHand = preflopLabel(self.holeCards)
    }
  }

  return {
    status: state.status,
    phase: state.phase,
    selfId: playerId,
    handNumber: state.handNumber,
    currentPlayerId: state.currentPlayerId,
    yourTurn,
    dealerId,
    smallBlindId: sbId,
    bigBlindId: bbId,
    communityCards: [...state.communityCards],
    players,
    pot: potTotal(state),
    pots,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    startingChips: state.startingChips,
    targetChips: state.targetChips,
    legal: yourTurn ? getLegalActions(state, playerId) : NO_ACTIONS,
    canStartNextHand: state.status === 'hand_over' && !!self && !self.eliminated && !self.left,
    canFinishMatch: state.status === 'match_over',
    lastHand: state.lastHand,
    actionLog: state.actionLog,
    winnerId: state.winnerId,
    winReason: state.winReason,
    selfBestHand
  }
}

export function getResults(state: PokerGameState): PokerResults {
  return { winnerId: state.winnerId, winReason: state.winReason }
}
