/**
 * Pure, authoritative Blackjack rules — no React, no networking, no I/O beyond
 * Math.random (deck shuffling).
 *
 * Every human player plays their own hand against a single computer-controlled
 * dealer; players never play against each other. The authoritative
 * {@link BlackjackGameState} holds server-only information (the deck order and
 * the dealer's face-down hole card). Never send it to a client directly — use
 * `getPlayerView` (see `view.ts`) to produce a sanitized per-player view.
 *
 * The reducers here are total and synchronous: because the dealer is automated
 * and there are no server timers, finishing the last player's turn plays the
 * dealer out and settles the hand within the same call. The between-hands
 * `hand_over` phase lets clients read the result before triggering the next hand.
 */
import {
  createDeck,
  handTotal,
  isBlackjack,
  isBust,
  shuffle,
  type Card
} from './cards'
import {
  RESHUFFLE_THRESHOLD,
  STARTING_UNITS,
  WIN_TARGET_UNITS,
  computeBet,
  payoutForOutcome,
  resolveOutcome,
  shouldDealerHit,
  type HandOutcome
} from './rules'

export type BlackjackPlayerStatus =
  | 'waiting'
  | 'playing'
  | 'standing'
  | 'busted'
  | 'blackjack'
  | 'eliminated'

/** High-level phase of the match. `dealer_turn` is transient (never persisted
 *  between reducer calls) — the dealer plays out immediately when reached. */
export type BlackjackPhase = 'player_turns' | 'dealer_turn' | 'hand_over' | 'finished'

/** Authoritative per-player state (includes nothing hidden from other players —
 *  player hands are public once dealt). */
export interface BlackjackServerPlayer {
  playerId: string
  /** Available chips, in half-chip units (not currently committed to a bet). */
  chips: number
  /** Chips committed to the current hand, in half-chip units. */
  bet: number
  cards: Card[]
  status: BlackjackPlayerStatus
  /** True once the player has taken any action this hand (blocks double-down). */
  hasActed: boolean
  doubled: boolean
  /** Outcome of the most recently settled hand, for the results display. */
  lastResult?: HandOutcome
}

/** Authoritative server state. Contains hidden information (deck + hole card). */
export interface BlackjackGameState {
  status: BlackjackPhase
  playerOrder: string[]
  players: Record<string, BlackjackServerPlayer>
  /** Undrawn cards, top of deck at the END of the array (pop to draw). */
  deck: Card[]
  /** Dealer cards; index 1 is the hole card, hidden until {@link dealerRevealed}. */
  dealerCards: Card[]
  dealerRevealed: boolean
  /** Player id whose turn it is during `player_turns`, else undefined. */
  currentPlayerId?: string
  handNumber: number
  /** Set once the match is finished: the last player standing. */
  winnerId?: string
  /** A short human-readable summary of the last resolved hand (for messaging). */
  lastEvent?: string
}

export type ActionErrorCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER'

export type ActionResult =
  | { ok: true; state: BlackjackGameState }
  | { ok: false; code: ActionErrorCode; message: string }

function fail(code: ActionErrorCode, message: string): ActionResult {
  return { ok: false, code, message }
}

/** Deep clone so reducers never mutate their input (keeps them pure). */
function clone(state: BlackjackGameState): BlackjackGameState {
  return structuredClone(state)
}

// --- Deck helpers ----------------------------------------------------------

/** Cards currently visible on the table (dealer + all player hands). */
function cardsInPlay(state: BlackjackGameState): Card[] {
  const inPlay: Card[] = [...state.dealerCards]
  for (const id of state.playerOrder) inPlay.push(...state.players[id].cards)
  return inPlay
}

/**
 * Draw one card from the top of the deck, refilling mid-hand only if the deck
 * is unexpectedly empty (a fresh shuffled shoe of the cards not already on the
 * table, so a single hand never contains duplicates). Mutates `state.deck`.
 */
function drawCard(state: BlackjackGameState): Card {
  if (state.deck.length === 0) {
    const inPlay = new Set(cardsInPlay(state).map((c) => `${c.rank}${c.suit}`))
    const fresh = createDeck().filter((c) => !inPlay.has(`${c.rank}${c.suit}`))
    state.deck = shuffle(fresh)
  }
  return state.deck.pop() as Card
}

// --- Match / hand lifecycle ------------------------------------------------

/** True for a player still in the match (has chips / not eliminated). */
function isActive(p: BlackjackServerPlayer): boolean {
  return p.status !== 'eliminated'
}

/**
 * Create a new match: every player starts with 500 chips (in units), then the
 * first hand is dealt immediately so clients open straight into play.
 */
export function createGame(playerOrder: string[]): BlackjackGameState {
  const players: Record<string, BlackjackServerPlayer> = {}
  for (const id of playerOrder) {
    players[id] = {
      playerId: id,
      chips: STARTING_UNITS,
      bet: 0,
      cards: [],
      status: 'waiting',
      hasActed: false,
      doubled: false
    }
  }
  const state: BlackjackGameState = {
    status: 'player_turns',
    playerOrder: [...playerOrder],
    players,
    deck: shuffle(createDeck()),
    dealerCards: [],
    dealerRevealed: false,
    handNumber: 0,
    currentPlayerId: undefined
  }
  return beginHand(state)
}

/**
 * Begin a new hand: reshuffle if the shoe is low, reset every active player,
 * place automatic bets, deal two cards each (and to the dealer), then resolve
 * naturals and hand control to the first player — or straight to settlement if
 * the dealer has a natural Blackjack.
 */
function beginHand(state: BlackjackGameState): BlackjackGameState {
  state.handNumber++
  state.lastEvent = undefined
  // Enter the playing phase for the new hand. `settle` (dealer natural or an
  // all-natural table) overrides this to `hand_over`/`finished` as needed.
  state.status = 'player_turns'

  if (state.deck.length < RESHUFFLE_THRESHOLD) {
    state.deck = shuffle(createDeck())
  }

  const active = state.playerOrder.map((id) => state.players[id]).filter(isActive)

  // Clear eliminated players' stale cards so they display as spectators.
  for (const id of state.playerOrder) {
    const p = state.players[id]
    if (p.status === 'eliminated') {
      p.cards = []
      p.bet = 0
      p.lastResult = undefined
    }
  }

  // Reset hands and place automatic bets.
  for (const p of active) {
    p.cards = []
    p.status = 'waiting'
    p.hasActed = false
    p.doubled = false
    p.lastResult = undefined
    const bet = computeBet(p.chips)
    p.bet = bet
    p.chips -= bet
  }

  state.dealerCards = []
  state.dealerRevealed = false
  state.currentPlayerId = undefined

  // Deal two rounds: a card to each player, then the dealer, twice.
  for (let round = 0; round < 2; round++) {
    for (const p of active) p.cards.push(drawCard(state))
    state.dealerCards.push(drawCard(state))
  }

  // Mark player naturals; they auto-complete and are paid 3:2 at settlement.
  for (const p of active) {
    if (isBlackjack(p.cards)) p.status = 'blackjack'
  }

  // Dealer natural resolves the hand immediately (players with a natural push;
  // everyone else loses) — no player turns are taken.
  if (isBlackjack(state.dealerCards)) {
    state.dealerRevealed = true
    return settle(state)
  }

  return advanceTurn(state, null)
}

/**
 * Hand control passes to the next player still waiting to act. If none remain,
 * the dealer plays out and the hand is settled. `after` is the id whose turn
 * just ended (null when starting a hand).
 */
function advanceTurn(state: BlackjackGameState, after: string | null): BlackjackGameState {
  const order = state.playerOrder
  const startIndex = after ? order.indexOf(after) + 1 : 0
  for (let i = startIndex; i < order.length; i++) {
    const p = state.players[order[i]]
    if (p.status === 'waiting') {
      p.status = 'playing'
      state.currentPlayerId = order[i]
      return state
    }
  }
  // No one left to act — the dealer plays and the hand settles.
  state.currentPlayerId = undefined
  return dealerPlayAndSettle(state)
}

/** Reveal the hole card and draw for the dealer per house rules, then settle. */
function dealerPlayAndSettle(state: BlackjackGameState): BlackjackGameState {
  state.dealerRevealed = true
  // The dealer only needs to draw if at least one player can still win/push
  // (i.e. someone is standing or has a natural). If everyone busted, the
  // dealer stands pat.
  const anyLive = state.playerOrder
    .map((id) => state.players[id])
    .some((p) => p.status === 'standing' || p.status === 'blackjack')
  if (anyLive) {
    while (shouldDealerHit(state.dealerCards)) {
      state.dealerCards.push(drawCard(state))
    }
  }
  return settle(state)
}

/**
 * Pay out every player's hand against the dealer, then eliminate anyone with no
 * chips left and decide whether the match is over (one player standing).
 */
function settle(state: BlackjackGameState): BlackjackGameState {
  const dealerTotal = handTotal(state.dealerCards)
  const dealerBusted = isBust(state.dealerCards)
  const dealerBlackjack = isBlackjack(state.dealerCards)

  for (const id of state.playerOrder) {
    const p = state.players[id]
    if (p.status === 'eliminated') continue

    const playerBusted = p.status === 'busted'
    const playerBlackjack = p.status === 'blackjack'
    const outcome = resolveOutcome({
      playerTotal: handTotal(p.cards),
      playerBusted,
      playerBlackjack,
      dealerTotal,
      dealerBusted,
      dealerBlackjack
    })
    p.chips += payoutForOutcome(outcome, p.bet)
    p.lastResult = outcome
  }

  // Elimination happens only after the hand is fully settled.
  for (const id of state.playerOrder) {
    const p = state.players[id]
    if (p.status !== 'eliminated' && p.chips <= 0) {
      p.status = 'eliminated'
    }
  }

  state.lastEvent = describeHand(state)

  const remaining = state.playerOrder
    .map((id) => state.players[id])
    .filter((p) => p.status !== 'eliminated')

  // The match ends when someone reaches the chip target, or only one player is
  // left standing. On a target win, the player with the most chips takes it
  // (ties broken by seat order, matching playerOrder iteration).
  let targetWinner: BlackjackServerPlayer | undefined
  for (const p of remaining) {
    if (p.chips >= WIN_TARGET_UNITS && (!targetWinner || p.chips > targetWinner.chips)) {
      targetWinner = p
    }
  }

  if (targetWinner) {
    state.status = 'finished'
    state.winnerId = targetWinner.playerId
    state.currentPlayerId = undefined
  } else if (remaining.length <= 1) {
    state.status = 'finished'
    state.winnerId = remaining[0]?.playerId
    state.currentPlayerId = undefined
  } else {
    state.status = 'hand_over'
    state.currentPlayerId = undefined
  }
  return state
}

/** Build a short summary line of the just-settled hand for client messaging. */
function describeHand(state: BlackjackGameState): string {
  const dealerTotal = handTotal(state.dealerCards)
  if (isBust(state.dealerCards)) return `Dealer busts with ${dealerTotal}.`
  if (isBlackjack(state.dealerCards)) return 'Dealer has Blackjack.'
  return `Dealer stands on ${dealerTotal}.`
}

// --- Player actions --------------------------------------------------------

function requireTurn(state: BlackjackGameState, playerId: string): ActionResult | null {
  if (state.status === 'finished') return fail('GAME_OVER', 'The match has finished.')
  if (state.status !== 'player_turns') {
    return fail('INVALID_ACTION', 'No player is acting right now.')
  }
  if (state.currentPlayerId !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  return null
}

/** Hit: draw one card. Busting (or reaching 21) ends the turn automatically. */
export function hit(state: BlackjackGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const next = clone(state)
  const p = next.players[playerId]
  p.cards.push(drawCard(next))
  p.hasActed = true
  if (isBust(p.cards)) {
    p.status = 'busted'
    return { ok: true, state: advanceTurn(next, playerId) }
  }
  if (handTotal(p.cards) >= 21) {
    // A hard/soft 21 has nothing to gain from further hits — auto-stand.
    p.status = 'standing'
    return { ok: true, state: advanceTurn(next, playerId) }
  }
  return { ok: true, state: next }
}

/** Stand: end the turn with the current hand. */
export function stand(state: BlackjackGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const next = clone(state)
  const p = next.players[playerId]
  p.hasActed = true
  p.status = 'standing'
  return { ok: true, state: advanceTurn(next, playerId) }
}

/** Whether a player may double down right now (first decision, funds to match). */
export function canDoubleDown(p: BlackjackServerPlayer): boolean {
  return (
    p.status === 'playing' &&
    p.cards.length === 2 &&
    !p.hasActed &&
    p.chips >= p.bet &&
    p.bet > 0
  )
}

/**
 * Double down: match the original bet, take exactly one more card, then stand
 * automatically. Only legal on the first decision with two cards and enough
 * uncommitted chips to match the bet.
 */
export function doubleDown(state: BlackjackGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const p0 = state.players[playerId]
  if (!canDoubleDown(p0)) {
    return fail('INVALID_ACTION', 'You cannot double down right now.')
  }
  const next = clone(state)
  const p = next.players[playerId]
  p.chips -= p.bet
  p.bet *= 2
  p.doubled = true
  p.hasActed = true
  p.cards.push(drawCard(next))
  p.status = isBust(p.cards) ? 'busted' : 'standing'
  return { ok: true, state: advanceTurn(next, playerId) }
}

/**
 * Start the next hand. Only valid in the `hand_over` phase; any remaining
 * player may trigger it (it is idempotent within a phase). Clears the previous
 * cards, places bets and deals afresh.
 */
export function nextHand(state: BlackjackGameState, playerId: string): ActionResult {
  if (state.status === 'finished') return fail('GAME_OVER', 'The match has finished.')
  if (state.status !== 'hand_over') {
    return fail('INVALID_ACTION', 'The current hand is still in progress.')
  }
  if (!state.playerOrder.includes(playerId)) {
    return fail('INVALID_ACTION', 'You are not in this match.')
  }
  return { ok: true, state: beginHand(clone(state)) }
}

/**
 * Remove a player mid-match (disconnect/leave): they forfeit any current bet
 * and are dropped from the match. If it was their turn, play advances; if only
 * one player is left, they win the match. Returns null if nobody remains.
 */
export function removePlayerFromGame(
  state: BlackjackGameState,
  playerId: string
): BlackjackGameState | null {
  if (!state.playerOrder.includes(playerId)) return state
  const next = clone(state)
  const wasCurrent = next.currentPlayerId === playerId
  const wasPlayerTurns = next.status === 'player_turns'

  next.playerOrder = next.playerOrder.filter((id) => id !== playerId)
  delete next.players[playerId]
  if (next.playerOrder.length === 0) return null

  if (next.status === 'finished') {
    return next
  }

  const remaining = next.playerOrder
    .map((id) => next.players[id])
    .filter((p) => p.status !== 'eliminated')
  if (remaining.length <= 1) {
    next.status = 'finished'
    next.winnerId = remaining[0]?.playerId
    next.currentPlayerId = undefined
    return next
  }

  // If the departing player was mid-turn, hand control moves on (which may run
  // the dealer and settle if they were the last to act).
  if (wasPlayerTurns && wasCurrent) {
    next.currentPlayerId = undefined
    return advanceTurn(next, null)
  }
  return next
}

/** The player id whose turn it is, or undefined outside `player_turns`. */
export function currentPlayerId(state: BlackjackGameState): string | undefined {
  return state.currentPlayerId
}
