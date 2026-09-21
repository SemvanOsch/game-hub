/**
 * Pure, authoritative Texas Hold'em No-Limit engine — no React, no networking,
 * no I/O beyond Math.random (deck shuffling via the shared card helpers).
 *
 * This is an ELIMINATION / target-chip game, not a series of independent hands:
 * the authoritative {@link PokerGameState} tracks every player's chip stack, and
 * the match ends the moment a player reaches the chip target or becomes the only
 * player left with chips. The between-hands `hand_over` phase lets clients read
 * the showdown before the next hand begins.
 *
 * SECURITY: this state contains hidden information (the undealt deck order and
 * every player's hole cards). Never send it to a client directly — `view.ts`
 * produces the sanitized per-player view, which strips opponents' hole cards
 * (they are not serialized at all, not merely hidden with CSS) until a
 * legitimate showdown reveal.
 *
 * The reducers are total and synchronous. All chip amounts are whole integers.
 */
import { createDeck, shuffle, type Card } from '../blackjack/cards'
import {
  describeHand,
  getBestFiveCardHand,
  compareEvaluated,
  type EvaluatedHand,
  type HandCategory
} from './handEval'
import { calculateSidePots, type PlayerContribution } from './sidePots'

// --- Configuration (defaults; represented explicitly in state) --------------

export const STARTING_CHIPS = 500
export const TARGET_CHIPS = 2000
export const SMALL_BLIND = 10
export const BIG_BLIND = 20
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

export type PokerStatus = 'playing' | 'hand_over' | 'match_over' | 'game_over'
export type PokerPhase = 'preflop' | 'flop' | 'turn' | 'river'
export type PokerWinReason = 'target_reached' | 'last_player_standing'

/** The distinct kinds of things recorded in the action log (id-based; the UI
 *  resolves player names). */
export type PokerActionKind =
  | 'small_blind'
  | 'big_blind'
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'all_in'
  | 'phase'
  | 'win'

export interface PokerActionLogEntry {
  seq: number
  kind: PokerActionKind
  playerId?: string
  amount?: number
  /** For phase entries: 'flop' | 'turn' | 'river' | 'showdown'. */
  phase?: string
}

/** Authoritative per-player state. Hole cards are hidden information. */
export interface PokerPlayer {
  id: string
  /** Chips in the player's stack (NOT counting chips already in the pot). */
  chips: number
  /** Chips committed in the CURRENT betting round (reset each street). */
  bet: number
  /** Chips committed across the WHOLE hand (drives side-pot construction). */
  totalBet: number
  folded: boolean
  allIn: boolean
  /** Out of the match: 0 chips. Stays visible but never dealt in again. */
  eliminated: boolean
  /** Disconnected/left mid-hand: treated as folded, purged at the next hand. */
  left: boolean
  holeCards: Card[]
  /** Whether the player has acted since the current bet level was set. */
  hasActed: boolean
  lastAction?: PokerActionKind
}

/** Outcome of one pot at showdown, for the results display. */
export interface PotResult {
  amount: number
  winnerIds: string[]
  /** Winning hand label (present only when the pot was contested to showdown). */
  handLabel?: string
}

/** A player's revealed cards at showdown. */
export interface RevealedHand {
  playerId: string
  holeCards: Card[]
  category?: HandCategory
  label?: string
  /** The best five cards, for highlighting. */
  bestCards?: Card[]
}

/** Summary of the just-completed hand (for the between-hands review UI). */
export interface HandSummary {
  showdown: boolean
  revealed: RevealedHand[]
  pots: PotResult[]
  /** Chips won this hand, per player id (only winners appear). */
  winnings: Record<string, number>
  communityCards: Card[]
  handNumber: number
}

/** Authoritative game state. Contains hidden information (deck + hole cards). */
export interface PokerGameState {
  status: PokerStatus
  phase: PokerPhase
  playerOrder: string[]
  players: Record<string, PokerPlayer>
  /** Undrawn cards, top of deck at the END of the array (pop to draw). */
  deck: Card[]
  communityCards: Card[]
  /** Highest per-player bet in the current betting round. */
  currentBet: number
  /** Minimum legal raise INCREMENT for the current round. */
  minRaise: number
  /** Index into {@link playerOrder} of the dealer button. */
  dealerIndex: number
  currentPlayerId?: string
  smallBlind: number
  bigBlind: number
  startingChips: number
  targetChips: number
  handNumber: number
  actionLog: PokerActionLogEntry[]
  /** Monotonic counter for action-log ordering. */
  logSeq: number
  lastHand?: HandSummary
  /** Overall match winner (set once, in `game_over`). */
  winnerId?: string
  winReason?: PokerWinReason
}

export type ActionErrorCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER'
export type ActionResult =
  | { ok: true; state: PokerGameState }
  | { ok: false; code: ActionErrorCode; message: string }

function fail(code: ActionErrorCode, message: string): ActionResult {
  return { ok: false, code, message }
}

/** Deep clone so reducers never mutate their input (keeps them pure). */
function clone(state: PokerGameState): PokerGameState {
  return structuredClone(state)
}

// --- Player queries ---------------------------------------------------------

/** In the match (has chips / not eliminated / not gone). */
function isSeated(p: PokerPlayer): boolean {
  return !p.eliminated && !p.left
}

/** Dealt into and still contesting the current hand (all-in still counts). */
function isInHand(p: PokerPlayer): boolean {
  return !p.folded && !p.eliminated && !p.left && p.holeCards.length > 0
}

/** Whether a player still owes an action in the current betting round. */
function needsToAct(state: PokerGameState, p: PokerPlayer): boolean {
  if (p.folded || p.allIn || p.eliminated || p.left) return false
  if (p.holeCards.length === 0) return false
  return !p.hasActed || p.bet < state.currentBet
}

function seatedPlayers(state: PokerGameState): PokerPlayer[] {
  return state.playerOrder.map((id) => state.players[id]).filter(isSeated)
}

function playersInHand(state: PokerGameState): PokerPlayer[] {
  return state.playerOrder.map((id) => state.players[id]).filter(isInHand)
}

/** Next seat index after `from` (wrapping) that is still in the match. */
function nextSeatedIndex(state: PokerGameState, from: number): number {
  const n = state.playerOrder.length
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n
    if (isSeated(state.players[state.playerOrder[idx]])) return idx
  }
  return from
}

/** First seat index at or after `start` (wrapping) whose player needs to act. */
function firstToAct(state: PokerGameState, start: number): number {
  const n = state.playerOrder.length
  for (let i = 0; i < n; i++) {
    const idx = (start + i) % n
    if (needsToAct(state, state.players[state.playerOrder[idx]])) return idx
  }
  return -1
}

/** First seat index strictly after `from` (wrapping) whose player needs to act. */
function nextToAct(state: PokerGameState, from: number): number {
  const n = state.playerOrder.length
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n
    if (needsToAct(state, state.players[state.playerOrder[idx]])) return idx
  }
  return -1
}

function indexOfPlayer(state: PokerGameState, playerId: string): number {
  return state.playerOrder.indexOf(playerId)
}

// --- Deck -------------------------------------------------------------------

function drawCard(state: PokerGameState): Card {
  return state.deck.pop() as Card
}

// --- Logging ----------------------------------------------------------------

const MAX_LOG_ENTRIES = 40

function log(state: PokerGameState, entry: Omit<PokerActionLogEntry, 'seq'>): void {
  state.actionLog.push({ seq: state.logSeq++, ...entry })
  if (state.actionLog.length > MAX_LOG_ENTRIES) {
    state.actionLog.splice(0, state.actionLog.length - MAX_LOG_ENTRIES)
  }
}

// --- Chip movement ----------------------------------------------------------

/** Move up to `amount` chips from a player's stack into the pot for this round.
 *  Returns the amount actually committed (capped at their stack). */
function commit(p: PokerPlayer, amount: number): number {
  const put = Math.min(Math.max(0, Math.floor(amount)), p.chips)
  p.chips -= put
  p.bet += put
  p.totalBet += put
  if (p.chips === 0 && (p.bet > 0 || p.totalBet > 0)) p.allIn = true
  return put
}

/** Total chips currently in the pot (all rounds, all players). */
export function potTotal(state: PokerGameState): number {
  return state.playerOrder.reduce((sum, id) => sum + state.players[id].totalBet, 0)
}

// --- Match / hand lifecycle -------------------------------------------------

/** Create a new match: everyone starts with the configured chip stack; the first
 *  hand is dealt immediately so clients open straight into play. */
export function createGame(
  playerOrder: string[],
  config?: Partial<{
    startingChips: number
    targetChips: number
    smallBlind: number
    bigBlind: number
  }>
): PokerGameState {
  const startingChips = config?.startingChips ?? STARTING_CHIPS
  const targetChips = config?.targetChips ?? TARGET_CHIPS
  const smallBlind = config?.smallBlind ?? SMALL_BLIND
  const bigBlind = config?.bigBlind ?? BIG_BLIND

  const players: Record<string, PokerPlayer> = {}
  for (const id of playerOrder) {
    players[id] = {
      id,
      chips: startingChips,
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      eliminated: false,
      left: false,
      holeCards: [],
      hasActed: false
    }
  }

  const state: PokerGameState = {
    status: 'playing',
    phase: 'preflop',
    playerOrder: [...playerOrder],
    players,
    deck: [],
    communityCards: [],
    currentBet: 0,
    minRaise: bigBlind,
    dealerIndex: 0,
    smallBlind,
    bigBlind,
    startingChips,
    targetChips,
    handNumber: 0,
    actionLog: [],
    logSeq: 0
  }

  return beginHand(state, false)
}

/**
 * Begin a new hand: purge players who left, reset each seated player, rotate the
 * dealer button (skipping eliminated seats), post blinds, deal hole cards and
 * pass control to the first player to act pre-flop.
 */
function beginHand(state: PokerGameState, advanceDealer: boolean): PokerGameState {
  // Purge players who left mid-hand: drop them from the order entirely.
  state.playerOrder = state.playerOrder.filter((id) => !state.players[id].left)
  for (const id of Object.keys(state.players)) {
    if (state.players[id].left) delete state.players[id]
  }

  state.handNumber++
  state.phase = 'preflop'
  state.status = 'playing'
  state.communityCards = []
  state.currentBet = 0
  state.minRaise = state.bigBlind
  state.lastHand = undefined
  state.deck = shuffle(createDeck())

  // Reset every player's per-hand state (eliminated players stay out).
  for (const id of state.playerOrder) {
    const p = state.players[id]
    p.bet = 0
    p.totalBet = 0
    p.folded = false
    p.allIn = false
    p.holeCards = []
    p.hasActed = false
    p.lastAction = undefined
  }

  // Rotate / place the dealer button on a seated player.
  if (advanceDealer) {
    state.dealerIndex = nextSeatedIndex(state, state.dealerIndex)
  } else if (!isSeated(state.players[state.playerOrder[state.dealerIndex]])) {
    state.dealerIndex = nextSeatedIndex(state, state.dealerIndex)
  }

  const seated = seatedPlayers(state)
  const dealerIdx = state.dealerIndex

  // Determine blind seats. Heads-up: the dealer is the small blind.
  let sbIdx: number
  let bbIdx: number
  if (seated.length === 2) {
    sbIdx = dealerIdx
    bbIdx = nextSeatedIndex(state, dealerIdx)
  } else {
    sbIdx = nextSeatedIndex(state, dealerIdx)
    bbIdx = nextSeatedIndex(state, sbIdx)
  }

  const sb = state.players[state.playerOrder[sbIdx]]
  const bb = state.players[state.playerOrder[bbIdx]]

  const sbPosted = commit(sb, state.smallBlind)
  sb.lastAction = 'small_blind'
  log(state, { kind: 'small_blind', playerId: sb.id, amount: sbPosted })

  const bbPosted = commit(bb, state.bigBlind)
  bb.lastAction = 'big_blind'
  log(state, { kind: 'big_blind', playerId: bb.id, amount: bbPosted })

  // The bet to match is a full big blind even when the poster was short.
  state.currentBet = state.bigBlind
  state.minRaise = state.bigBlind

  // Deal two hole cards to each seated player (one at a time, twice round).
  for (let round = 0; round < 2; round++) {
    for (const p of seated) p.holeCards.push(drawCard(state))
  }

  // First to act pre-flop is the seat after the big blind (== the dealer in
  // heads-up play, since the button posted the small blind).
  const firstIdx = firstToAct(state, (bbIdx + 1) % state.playerOrder.length)
  if (firstIdx < 0) {
    // Nobody can act (everyone already all-in from blinds) — run it out.
    return runOutAndSettle(state)
  }
  state.currentPlayerId = state.playerOrder[firstIdx]
  return state
}

/** Reset per-round betting so a new street starts fresh. */
function resetRoundBets(state: PokerGameState): void {
  for (const id of state.playerOrder) {
    const p = state.players[id]
    p.bet = 0
    p.hasActed = false
  }
  state.currentBet = 0
  state.minRaise = state.bigBlind
}

/** Deal the community cards for the next street and log it. */
function dealStreet(state: PokerGameState): void {
  if (state.phase === 'preflop') {
    state.communityCards.push(drawCard(state), drawCard(state), drawCard(state))
    state.phase = 'flop'
    log(state, { kind: 'phase', phase: 'flop' })
  } else if (state.phase === 'flop') {
    state.communityCards.push(drawCard(state))
    state.phase = 'turn'
    log(state, { kind: 'phase', phase: 'turn' })
  } else if (state.phase === 'turn') {
    state.communityCards.push(drawCard(state))
    state.phase = 'river'
    log(state, { kind: 'phase', phase: 'river' })
  }
}

/**
 * Advance from a completed betting round: deal the next street and open its
 * betting, or, on the river, go to showdown. If at most one player can still
 * act, remaining streets are dealt automatically and the hand goes to showdown.
 */
function advancePhase(state: PokerGameState): PokerGameState {
  if (state.phase === 'river') {
    return resolveHand(state, true)
  }
  resetRoundBets(state)
  dealStreet(state)
  return openBettingRound(state)
}

/** Open the current street's betting, or run it out when nobody can act. */
function openBettingRound(state: PokerGameState): PokerGameState {
  const actable = playersInHand(state).filter((p) => !p.allIn)
  if (actable.length <= 1) {
    // No meaningful betting possible — deal the rest and settle.
    return runOutAndSettle(state)
  }
  // Post-flop, first to act is the first live seat left of the dealer.
  const firstIdx = firstToAct(state, (state.dealerIndex + 1) % state.playerOrder.length)
  if (firstIdx < 0) return runOutAndSettle(state)
  state.currentPlayerId = state.playerOrder[firstIdx]
  return state
}

/** Deal any remaining community cards (everyone all-in) then resolve showdown. */
function runOutAndSettle(state: PokerGameState): PokerGameState {
  state.currentPlayerId = undefined
  while (state.phase !== 'river') {
    resetRoundBets(state)
    dealStreet(state)
  }
  return resolveHand(state, true)
}

/**
 * After a betting action, decide what happens next: an uncontested pot (all but
 * one folded), the next player to act, or the end of the round.
 */
function progressAfterAction(state: PokerGameState, actorId: string): PokerGameState {
  const contesting = playersInHand(state)
  if (contesting.length <= 1) {
    // Everyone else folded — the last player wins without a showdown.
    return resolveHand(state, false)
  }
  const from = indexOfPlayer(state, actorId)
  const nextIdx = nextToAct(state, from)
  if (nextIdx >= 0) {
    state.currentPlayerId = state.playerOrder[nextIdx]
    return state
  }
  // Betting round complete.
  return advancePhase(state)
}

// --- Showdown / settlement --------------------------------------------------

/**
 * Resolve the hand: build side pots, award each pot to its best eligible hand(s)
 * (splitting ties and distributing odd chips left of the dealer), reveal cards on
 * a showdown, then eliminate busted players and evaluate the match win condition.
 */
export function resolveHand(state: PokerGameState, showdown: boolean): PokerGameState {
  state.currentPlayerId = undefined

  const contributions: PlayerContribution[] = state.playerOrder.map((id) => {
    const p = state.players[id]
    return { playerId: id, contributed: p.totalBet, folded: p.folded || p.eliminated || p.left }
  })
  const pots = calculateSidePots(contributions)

  // Pre-evaluate every contender's best hand once (only when five cards exist —
  // a pre-flop fold-win never reaches a showdown, so no evaluation is needed).
  const evaluated = new Map<string, EvaluatedHand>()
  for (const p of playersInHand(state)) {
    const combined = [...p.holeCards, ...state.communityCards]
    if (combined.length >= 5) evaluated.set(p.id, getBestFiveCardHand(combined))
  }

  const winnings: Record<string, number> = {}
  const potResults: PotResult[] = []

  for (const pot of pots) {
    const eligible = pot.eligiblePlayerIds.filter((id) => isInHand(state.players[id]))
    if (eligible.length === 0) continue

    let winners: string[]
    let handLabel: string | undefined
    if (eligible.length === 1) {
      winners = eligible
      const ev = evaluated.get(eligible[0])
      if (showdown && ev) handLabel = describeHand(ev)
    } else {
      // Highest hand takes it; equal-strength hands split.
      let best: EvaluatedHand | undefined
      winners = []
      for (const id of eligible) {
        const ev = evaluated.get(id)
        if (!ev) continue
        if (!best || compareEvaluated(ev, best) > 0) {
          best = ev
          winners = [id]
        } else if (compareEvaluated(ev, best) === 0) {
          winners.push(id)
        }
      }
      if (best) handLabel = describeHand(best)
    }

    distributePot(state, pot.amount, winners, winnings)
    potResults.push({ amount: pot.amount, winnerIds: winners, handLabel })
  }

  for (const [id, amount] of Object.entries(winnings)) {
    log(state, { kind: 'win', playerId: id, amount })
  }

  // Reveal contenders' cards only at a genuine showdown.
  const revealed: RevealedHand[] = []
  if (showdown) {
    for (const p of playersInHand(state)) {
      const ev = evaluated.get(p.id)
      revealed.push({
        playerId: p.id,
        holeCards: [...p.holeCards],
        category: ev?.category,
        label: ev ? describeHand(ev) : undefined,
        bestCards: ev?.cards
      })
    }
  }

  state.lastHand = {
    showdown,
    revealed,
    pots: potResults,
    winnings,
    communityCards: [...state.communityCards],
    handNumber: state.handNumber
  }

  // Clear the per-round bet display now the pot is settled (totalBet is kept so
  // the pot total and side-pot breakdown still read correctly on the review UI).
  for (const id of state.playerOrder) state.players[id].bet = 0

  // Chips are settled — NOW eliminate the busted and check the win condition.
  for (const id of state.playerOrder) {
    const p = state.players[id]
    if (!p.eliminated && !p.left && p.chips <= 0) p.eliminated = true
  }

  return checkPokerGameWinCondition(state)
}

/** Split `amount` among `winners`, distributing odd remainder chips one at a time
 *  starting from the first winner left of the dealer (standard poker rule). */
function distributePot(
  state: PokerGameState,
  amount: number,
  winners: string[],
  winnings: Record<string, number>
): void {
  if (winners.length === 0) return
  const base = Math.floor(amount / winners.length)
  let remainder = amount - base * winners.length

  // Order winners by seat, starting with the first seat LEFT OF the dealer (the
  // dealer's own seat sorts last), for distributing the odd chips.
  const n = state.playerOrder.length
  const ordered = [...winners].sort((a, b) => {
    const ra = (indexOfPlayer(state, a) - state.dealerIndex - 1 + n) % n
    const rb = (indexOfPlayer(state, b) - state.dealerIndex - 1 + n) % n
    return ra - rb
  })

  for (const id of ordered) {
    let share = base
    if (remainder > 0) {
      share += 1
      remainder -= 1
    }
    state.players[id].chips += share
    winnings[id] = (winnings[id] ?? 0) + share
  }
}

/**
 * The single authoritative win-condition check, run AFTER chip settlement and
 * elimination. The match ends only when one player is left with chips.
 *
 * A match-ending hand pauses on `match_over` (winner decided, the last hand still
 * on the table) rather than jumping straight to `game_over`, so players can read
 * the final result before the game-over screen. `finishMatch` completes it.
 */
export function checkPokerGameWinCondition(state: PokerGameState): PokerGameState {
  const remaining = seatedPlayers(state)

  // Last player standing — the only win condition.
  if (remaining.length <= 1) {
    state.status = 'match_over'
    state.winnerId = remaining[0]?.id
    state.winReason = 'last_player_standing'
    state.currentPlayerId = undefined
    return state
  }

  // Otherwise the match continues — await the next hand.
  state.status = 'hand_over'
  return state
}

// --- Player actions ---------------------------------------------------------

function requireTurn(state: PokerGameState, playerId: string): ActionResult | null {
  if (state.status === 'game_over') return fail('GAME_OVER', 'The game has finished.')
  if (state.status !== 'playing') return fail('INVALID_ACTION', 'No betting is in progress.')
  if (state.currentPlayerId !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  const p = state.players[playerId]
  if (!p || p.folded || p.allIn || p.eliminated || p.left) {
    return fail('INVALID_ACTION', 'You cannot act right now.')
  }
  return null
}

export function fold(state: PokerGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const next = clone(state)
  const p = next.players[playerId]
  p.folded = true
  p.hasActed = true
  p.lastAction = 'fold'
  log(next, { kind: 'fold', playerId })
  return { ok: true, state: progressAfterAction(next, playerId) }
}

export function check(state: PokerGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const p = state.players[playerId]
  if (p.bet !== state.currentBet) {
    return fail('INVALID_ACTION', 'You cannot check facing a bet.')
  }
  const next = clone(state)
  const np = next.players[playerId]
  np.hasActed = true
  np.lastAction = 'check'
  log(next, { kind: 'check', playerId })
  return { ok: true, state: progressAfterAction(next, playerId) }
}

export function call(state: PokerGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const p = state.players[playerId]
  const toCall = state.currentBet - p.bet
  if (toCall <= 0) return fail('INVALID_ACTION', 'There is nothing to call — check instead.')
  const next = clone(state)
  const np = next.players[playerId]
  const put = commit(np, toCall)
  np.hasActed = true
  np.lastAction = np.allIn ? 'all_in' : 'call'
  log(next, { kind: np.allIn ? 'all_in' : 'call', playerId, amount: put })
  return { ok: true, state: progressAfterAction(next, playerId) }
}

/** Place the first bet of a round (only when no one has bet yet). `amount` is the
 *  total the player's round bet becomes (== the bet size, since their bet was 0). */
export function bet(state: PokerGameState, playerId: string, amount: number): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  if (state.currentBet !== 0) {
    return fail('INVALID_ACTION', 'There is already a bet — raise instead.')
  }
  const p = state.players[playerId]
  const target = Math.floor(amount)
  const maxTarget = p.bet + p.chips
  // Minimum bet is one big blind, unless shoving less than that all-in.
  const minTarget = Math.min(state.bigBlind, maxTarget)
  if (target < minTarget || target > maxTarget) {
    return fail('INVALID_ACTION', `Bet must be between ${minTarget} and ${maxTarget}.`)
  }
  const next = clone(state)
  const np = next.players[playerId]
  commit(np, target - np.bet)
  next.currentBet = np.bet
  next.minRaise = np.bet
  np.hasActed = true
  np.lastAction = np.allIn ? 'all_in' : 'bet'
  log(next, { kind: np.allIn ? 'all_in' : 'bet', playerId, amount: np.bet })
  return { ok: true, state: progressAfterAction(next, playerId) }
}

/** Raise to a new total round bet `amount`. Increment must be at least the
 *  minimum raise unless the player is going all-in for less. */
export function raise(state: PokerGameState, playerId: string, amount: number): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  if (state.currentBet === 0) {
    return fail('INVALID_ACTION', 'Nothing to raise — bet instead.')
  }
  const p = state.players[playerId]
  const target = Math.floor(amount)
  const maxTarget = p.bet + p.chips
  if (target <= state.currentBet) {
    return fail('INVALID_ACTION', 'A raise must exceed the current bet.')
  }
  if (target > maxTarget) {
    return fail('INVALID_ACTION', 'You do not have enough chips for that raise.')
  }
  const isAllIn = target === maxTarget
  const increment = target - state.currentBet
  if (increment < state.minRaise && !isAllIn) {
    return fail('INVALID_ACTION', `Minimum raise is to ${state.currentBet + state.minRaise}.`)
  }
  const next = clone(state)
  const np = next.players[playerId]
  commit(np, target - np.bet)
  if (increment >= next.minRaise) next.minRaise = increment
  next.currentBet = np.bet
  np.hasActed = true
  np.lastAction = np.allIn ? 'all_in' : 'raise'
  log(next, { kind: np.allIn ? 'all_in' : 'raise', playerId, amount: np.bet })
  return { ok: true, state: progressAfterAction(next, playerId) }
}

/** Commit every remaining chip. Interpreted as a bet, raise or call depending on
 *  the current bet level. */
export function allIn(state: PokerGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const p = state.players[playerId]
  if (p.chips <= 0) return fail('INVALID_ACTION', 'You have no chips to push.')
  const next = clone(state)
  const np = next.players[playerId]
  commit(np, np.chips)
  if (np.bet > next.currentBet) {
    const increment = np.bet - next.currentBet
    if (increment >= next.minRaise) next.minRaise = increment
    next.currentBet = np.bet
  }
  np.hasActed = true
  np.lastAction = 'all_in'
  log(next, { kind: 'all_in', playerId, amount: np.bet })
  return { ok: true, state: progressAfterAction(next, playerId) }
}

/** Start the next hand. Valid only in the between-hands `hand_over` phase; any
 *  seated player may trigger it (idempotent within the phase). */
export function nextHand(state: PokerGameState, playerId: string): ActionResult {
  if (state.status === 'game_over') return fail('GAME_OVER', 'The game has finished.')
  if (state.status !== 'hand_over') {
    return fail('INVALID_ACTION', 'The current hand is still in progress.')
  }
  if (!state.playerOrder.includes(playerId)) {
    return fail('INVALID_ACTION', 'You are not in this game.')
  }
  return { ok: true, state: beginHand(clone(state), true) }
}

/**
 * Complete a finished match from the `match_over` review phase, advancing it to
 * `game_over` so the game-over screen (and match recording) takes over. Any
 * player in the game may trigger it — including an eliminated one, so a knocked-
 * out player can dismiss the final hand themselves. Idempotent: once `game_over`
 * it stays there.
 */
export function finishMatch(state: PokerGameState, playerId: string): ActionResult {
  if (state.status === 'game_over') return fail('GAME_OVER', 'The game has finished.')
  if (state.status !== 'match_over') {
    return fail('INVALID_ACTION', 'The match is not over yet.')
  }
  if (!state.playerOrder.includes(playerId)) {
    return fail('INVALID_ACTION', 'You are not in this game.')
  }
  const next = clone(state)
  next.status = 'game_over'
  next.currentPlayerId = undefined
  return { ok: true, state: next }
}

/**
 * Remove a player mid-match (disconnect / leave). They forfeit any chips already
 * in the pot and are treated as folded for the current hand, then purged. If this
 * ends the hand or the match, that is resolved before returning. Returns null if
 * nobody remains.
 */
export function removePlayerFromGame(
  state: PokerGameState,
  playerId: string
): PokerGameState | null {
  if (!state.playerOrder.includes(playerId)) return state
  const next = clone(state)
  const p = next.players[playerId]
  const wasCurrent = next.currentPlayerId === playerId

  // Mark as folded + gone. Their totalBet stays in the pot (dead money) until
  // this hand resolves; `beginHand` purges them from the order next hand.
  p.folded = true
  p.left = true
  p.eliminated = true

  const remainingSeated = seatedPlayers(next)
  if (remainingSeated.length === 0 && next.playerOrder.length === 1) {
    // Only the departing player was left.
    return null
  }

  // If the match is already over (or in its final review), preserve that state
  // so the result stays intact for whoever is still watching.
  if (next.status === 'game_over' || next.status === 'match_over') {
    return next.playerOrder.length > 0 ? next : null
  }

  // If we're between hands, just re-check the win condition (they may have been
  // the second-to-last player, handing someone the match).
  if (next.status === 'hand_over') {
    return checkPokerGameWinCondition(next)
  }

  // Mid-hand: if only one contender remains, resolve immediately; else, if it was
  // their turn, pass action on (which may end the round / run out the board).
  const contesting = playersInHand(next)
  if (contesting.length <= 1) {
    return resolveHand(next, false)
  }
  if (wasCurrent) {
    const from = indexOfPlayer(next, playerId)
    const nextIdx = nextToAct(next, from)
    if (nextIdx >= 0) {
      next.currentPlayerId = next.playerOrder[nextIdx]
      return next
    }
    return advancePhase(next)
  }
  return next
}

/** The player id whose turn it is, or undefined outside active betting. */
export function currentPlayerId(state: PokerGameState): string | undefined {
  return state.currentPlayerId
}
