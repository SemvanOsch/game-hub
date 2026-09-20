/**
 * Pure, authoritative Blackjack rules — no React, no networking, no I/O beyond
 * Math.random (deck shuffling).
 *
 * Every human player plays their own hand(s) against a single computer-controlled
 * dealer; players never play against each other. The authoritative
 * {@link BlackjackGameState} holds server-only information (the deck order and
 * the dealer's face-down hole card). Never send it to a client directly — use
 * `getPlayerView` (see `view.ts`) to produce a sanitized per-player view.
 *
 * A player may own MULTIPLE hands at once (from splitting a pair). Hands are
 * first-class state: each carries its own cards, bet and status, and a player's
 * turn plays through every playable hand left-to-right before control moves on.
 *
 * The reducers here are total and synchronous: because the dealer is automated
 * and there are no server timers, finishing the last hand plays the dealer out
 * and settles within the same call. The between-hands `hand_over` phase lets
 * clients read the result before triggering the next hand.
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
  MAX_HANDS_PER_PLAYER,
  RESHUFFLE_THRESHOLD,
  STARTING_UNITS,
  WIN_TARGET_UNITS,
  cardsFormSplittablePair,
  computeBet,
  getSplitValue,
  payoutForOutcome,
  resolveOutcome,
  shouldDealerHit,
  type HandOutcome
} from './rules'

/** The lifecycle of a single hand within a round. `blackjack` marks a NATURAL. */
export type BlackjackHandStatus = 'playing' | 'standing' | 'busted' | 'blackjack'

/**
 * Turn-flow status of a whole player (independent of any one hand):
 * - `waiting`   — dealt in, not yet reached their turn this round
 * - `playing`   — currently acting (their active hand is live)
 * - `done`      — every hand resolved; awaiting the dealer / other players
 * - `eliminated`— out of chips, spectating the rest of the match
 */
export type BlackjackPlayerStatus = 'waiting' | 'playing' | 'done' | 'eliminated'

/** One hand belonging to a player. A player starts each round with exactly one. */
export interface BlackjackHand {
  /** Stable id unique within the match (used as a React key and for targeting). */
  id: string
  cards: Card[]
  /** Chips committed to this hand, in half-chip units. */
  bet: number
  status: BlackjackHandStatus
  /** True once this hand has doubled down (drew its one extra card). */
  doubled: boolean
  /** True for a hand produced by splitting (so a 21 here is NOT a natural). */
  fromSplit: boolean
  /** True for a hand split from Aces (exactly one extra card, no hit/double). */
  splitAce: boolean
  /** Outcome of this hand once the round is settled, for the results display. */
  lastResult?: HandOutcome
}

/** Authoritative per-player state (no hidden info — player hands are public). */
export interface BlackjackServerPlayer {
  playerId: string
  /** Available chips NOT currently committed to any bet, in half-chip units. */
  chips: number
  /** One or more hands (more than one only after splitting). */
  hands: BlackjackHand[]
  /** Index into {@link hands} of the hand currently being played. */
  activeHandIndex: number
  status: BlackjackPlayerStatus
}

/**
 * High-level phase of the match. `dealer_turn` is transient (never persisted
 * between reducer calls) — the dealer plays out immediately when reached.
 *
 * `match_over` is the match-ending counterpart of `hand_over`: the final hand has
 * been settled and the winner is already decided, but the game deliberately
 * lingers on the table so players can see the last hand's result (dealer
 * revealed, per-hand outcomes) before advancing to the game-over screen. Only a
 * `finish` action moves it on to `finished`.
 */
export type BlackjackPhase =
  | 'player_turns'
  | 'dealer_turn'
  | 'hand_over'
  | 'match_over'
  | 'finished'

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
  /** Monotonic counter used to mint unique {@link BlackjackHand.id} values. */
  handIdSeq: number
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

// --- Hand helpers ----------------------------------------------------------

/** Mint a fresh hand with a match-unique id, mutating the state's id counter. */
function makeHand(
  state: BlackjackGameState,
  bet: number,
  fromSplit: boolean,
  splitAce: boolean
): BlackjackHand {
  const seq = state.handIdSeq ?? 0
  state.handIdSeq = seq + 1
  return { id: `h${seq}`, cards: [], bet, status: 'playing', doubled: false, fromSplit, splitAce }
}

/** A natural Blackjack: an ORIGINAL (unsplit) two-card 21. Split 21s don't count. */
export function isNaturalBlackjack(hand: BlackjackHand): boolean {
  return !hand.fromSplit && hand.cards.length === 2 && handTotal(hand.cards) === 21
}

/** The player's currently active hand, if any. */
function activeHandOf(p: BlackjackServerPlayer): BlackjackHand | undefined {
  return p.hands[p.activeHandIndex]
}

/** Index of the player's first hand still awaiting play, or -1 if none remain. */
export function getNextPlayableHand(p: BlackjackServerPlayer): number {
  return p.hands.findIndex((h) => h.status === 'playing')
}

/** Whether the player may split their given hand right now (funds/pair/cap). */
export function canSplitHand(p: BlackjackServerPlayer, hand: BlackjackHand): boolean {
  return (
    hand.status === 'playing' &&
    hand.cards.length === 2 &&
    !hand.splitAce && // re-splitting Aces is disabled for simplicity
    p.hands.length < MAX_HANDS_PER_PLAYER &&
    cardsFormSplittablePair(hand.cards) &&
    hand.bet > 0 &&
    p.chips >= hand.bet
  )
}

/** Whether the player may double down on their given hand (first two cards, funds). */
export function canDoubleHand(p: BlackjackServerPlayer, hand: BlackjackHand): boolean {
  return (
    hand.status === 'playing' &&
    hand.cards.length === 2 &&
    !hand.splitAce && // no double-down after splitting Aces
    hand.bet > 0 &&
    p.chips >= hand.bet
  )
}

// --- Deck helpers ----------------------------------------------------------

/** Cards currently visible on the table (dealer + every player's hands). */
function cardsInPlay(state: BlackjackGameState): Card[] {
  const inPlay: Card[] = [...state.dealerCards]
  for (const id of state.playerOrder) {
    for (const hand of state.players[id].hands) inPlay.push(...hand.cards)
  }
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
      hands: [],
      activeHandIndex: 0,
      status: 'waiting'
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
    handIdSeq: 0,
    currentPlayerId: undefined
  }
  return beginHand(state)
}

/**
 * Begin a new hand: reshuffle if the shoe is low, reset every active player to a
 * single freshly-bet hand, deal two cards each (and to the dealer), mark player
 * naturals, then pass control to the first player — or straight to settlement if
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

  // Clear eliminated players' stale hands so they display as spectators.
  for (const id of state.playerOrder) {
    const p = state.players[id]
    if (p.status === 'eliminated') {
      p.hands = []
      p.activeHandIndex = 0
    }
  }

  // Reset each active player to one hand with the automatic bet placed.
  for (const p of active) {
    p.status = 'waiting'
    p.activeHandIndex = 0
    const bet = computeBet(p.chips)
    p.chips -= bet
    p.hands = [makeHand(state, bet, false, false)]
  }

  state.dealerCards = []
  state.dealerRevealed = false
  state.currentPlayerId = undefined

  // Deal two rounds: a card to each player's hand, then the dealer, twice.
  for (let round = 0; round < 2; round++) {
    for (const p of active) p.hands[0].cards.push(drawCard(state))
    state.dealerCards.push(drawCard(state))
  }

  // Mark player naturals; they auto-complete and are paid 3:2 at settlement.
  for (const p of active) {
    if (isNaturalBlackjack(p.hands[0])) p.hands[0].status = 'blackjack'
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
 * Make a `waiting` player active on their first playable hand. If they have no
 * playable hand (e.g. a natural Blackjack), mark them `done` and report false so
 * the caller keeps looking for someone to act.
 */
function activatePlayer(state: BlackjackGameState, p: BlackjackServerPlayer): boolean {
  const idx = getNextPlayableHand(p)
  if (idx < 0) {
    p.status = 'done'
    return false
  }
  p.status = 'playing'
  p.activeHandIndex = idx
  state.currentPlayerId = p.playerId
  return true
}

/**
 * Advance play after a hand ends (or at the start of a hand, with `after` null).
 * First tries to keep the same player on their next playable hand; only once all
 * of a player's hands are done does control move to the next waiting player. When
 * nobody is left to act, the dealer plays out and the hand settles.
 */
function advanceTurn(state: BlackjackGameState, after: string | null): BlackjackGameState {
  // Stay with the current player while they still have a hand to play.
  if (after) {
    const cur = state.players[after]
    if (cur && cur.status === 'playing') {
      const idx = getNextPlayableHand(cur)
      if (idx >= 0) {
        cur.activeHandIndex = idx
        state.currentPlayerId = after
        return state
      }
      cur.status = 'done'
    }
  }

  const order = state.playerOrder
  const startIndex = after ? order.indexOf(after) + 1 : 0
  for (let i = startIndex; i < order.length; i++) {
    const p = state.players[order[i]]
    if (p.status === 'waiting' && activatePlayer(state, p)) return state
  }

  // No one left to act — the dealer plays and the hand settles.
  state.currentPlayerId = undefined
  return dealerPlayAndSettle(state)
}

/** Reveal the hole card and draw for the dealer per house rules, then settle. */
function dealerPlayAndSettle(state: BlackjackGameState): BlackjackGameState {
  state.dealerRevealed = true
  // The dealer only needs to draw if at least one hand can still win/push (i.e.
  // some hand is standing or a natural). If every hand busted, the dealer stands.
  const anyLive = state.playerOrder.some((id) =>
    state.players[id].hands.some((h) => h.status === 'standing' || h.status === 'blackjack')
  )
  if (anyLive) {
    while (shouldDealerHit(state.dealerCards)) {
      state.dealerCards.push(drawCard(state))
    }
  }
  return settle(state)
}

/**
 * Pay out every hand of every player against the dealer, then eliminate anyone
 * with no chips left and decide whether the match is over (one player standing).
 */
function settle(state: BlackjackGameState): BlackjackGameState {
  const dealerTotal = handTotal(state.dealerCards)
  const dealerBusted = isBust(state.dealerCards)
  const dealerBlackjack = isBlackjack(state.dealerCards)

  for (const id of state.playerOrder) {
    const p = state.players[id]
    if (p.status === 'eliminated') continue

    for (const hand of p.hands) {
      const outcome = resolveOutcome({
        playerTotal: handTotal(hand.cards),
        playerBusted: hand.status === 'busted',
        // Only a NATURAL Blackjack (status set at deal, never on a split) pays 3:2.
        playerBlackjack: hand.status === 'blackjack',
        dealerTotal,
        dealerBusted,
        dealerBlackjack
      })
      p.chips += payoutForOutcome(outcome, hand.bet)
      hand.lastResult = outcome
    }
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

  // A match-ending hand pauses on `match_over` (winner decided, last hand still
  // shown) rather than jumping straight to `finished`, so players can read the
  // final result before the game-over screen. `finishMatch` completes it.
  if (targetWinner) {
    state.status = 'match_over'
    state.winnerId = targetWinner.playerId
    state.currentPlayerId = undefined
  } else if (remaining.length <= 1) {
    state.status = 'match_over'
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

/** Hit the active hand: draw one card. Busting (or reaching 21) ends that hand. */
export function hit(state: BlackjackGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const next = clone(state)
  const p = next.players[playerId]
  const hand = p ? activeHandOf(p) : undefined
  if (!p || !hand || hand.status !== 'playing' || hand.splitAce) {
    return fail('INVALID_ACTION', 'You cannot hit right now.')
  }
  hand.cards.push(drawCard(next))
  if (isBust(hand.cards)) {
    hand.status = 'busted'
    return { ok: true, state: advanceTurn(next, playerId) }
  }
  if (handTotal(hand.cards) >= 21) {
    // A hard/soft 21 has nothing to gain from further hits — auto-stand.
    hand.status = 'standing'
    return { ok: true, state: advanceTurn(next, playerId) }
  }
  return { ok: true, state: next }
}

/** Stand: end the active hand and move on to the next hand/player. */
export function stand(state: BlackjackGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const next = clone(state)
  const p = next.players[playerId]
  const hand = p ? activeHandOf(p) : undefined
  if (!p || !hand || hand.status !== 'playing') {
    return fail('INVALID_ACTION', 'You cannot stand right now.')
  }
  hand.status = 'standing'
  return { ok: true, state: advanceTurn(next, playerId) }
}

/**
 * Double down the active hand: match its bet, take exactly one more card, then
 * stand automatically. Legal only on a two-card hand with enough chips, and never
 * on a split-Ace hand.
 */
export function doubleDown(state: BlackjackGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const p0 = state.players[playerId]
  const hand0 = p0 ? activeHandOf(p0) : undefined
  if (!p0 || !hand0 || !canDoubleHand(p0, hand0)) {
    return fail('INVALID_ACTION', 'You cannot double down right now.')
  }
  const next = clone(state)
  const p = next.players[playerId]
  const hand = activeHandOf(p) as BlackjackHand
  p.chips -= hand.bet
  hand.bet *= 2
  hand.doubled = true
  hand.cards.push(drawCard(next))
  hand.status = isBust(hand.cards) ? 'busted' : 'standing'
  return { ok: true, state: advanceTurn(next, playerId) }
}

/**
 * Split the active hand's pair into two hands. Deducts a second bet equal to the
 * hand's current bet, deals one card to each new hand, and then either continues
 * on the first playable hand or advances if both auto-finished (split Aces).
 */
export function split(state: BlackjackGameState, playerId: string): ActionResult {
  const guard = requireTurn(state, playerId)
  if (guard) return guard
  const p0 = state.players[playerId]
  const hand0 = p0 ? activeHandOf(p0) : undefined
  if (!p0 || !hand0 || !canSplitHand(p0, hand0)) {
    return fail('INVALID_ACTION', 'You cannot split right now.')
  }
  const next = clone(state)
  const p = next.players[playerId]
  const idx = p.activeHandIndex
  const hand = p.hands[idx]
  const isAce = getSplitValue(hand.cards[0]) === 11

  // Place the matching additional bet from uncommitted chips.
  p.chips -= hand.bet

  // Move the second card of the pair into a brand-new hand with the same bet.
  const movedCard = hand.cards.pop() as Card
  hand.fromSplit = true
  hand.splitAce = isAce
  const newHand = makeHand(next, hand.bet, true, isAce)
  newHand.cards.push(movedCard)

  // Keep hands in play order: the new hand sits right after the active one.
  p.hands.splice(idx + 1, 0, newHand)

  // Deal exactly one new card to each split hand.
  hand.cards.push(drawCard(next))
  newHand.cards.push(drawCard(next))

  resolveSplitHand(hand, isAce)
  resolveSplitHand(newHand, isAce)

  // Continue on the first hand still needing play; if both finished (split Aces),
  // move control on to the next player.
  const nextIdx = getNextPlayableHand(p)
  if (nextIdx >= 0) {
    p.activeHandIndex = nextIdx
    return { ok: true, state: next }
  }
  return { ok: true, state: advanceTurn(next, playerId) }
}

/**
 * Settle the status of a freshly-dealt split hand: split Aces (and any hand that
 * lands on 21) auto-stand; otherwise the hand stays live for further play. A
 * split hand can never be a natural Blackjack, so a 21 here is just a normal 21.
 */
function resolveSplitHand(hand: BlackjackHand, isAce: boolean): void {
  if (isBust(hand.cards)) {
    hand.status = 'busted'
  } else if (isAce || handTotal(hand.cards) >= 21) {
    hand.status = 'standing'
  } else {
    hand.status = 'playing'
  }
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
 * Complete a finished match from the `match_over` review phase, moving it to
 * `finished` so the game-over screen (and match recording) takes over. Any
 * player in the match may trigger it — including an eliminated one, so a knocked
 * -out player can dismiss the final hand themselves. Idempotent side effects:
 * once `finished` it stays finished.
 */
export function finishMatch(state: BlackjackGameState, playerId: string): ActionResult {
  if (state.status === 'finished') return fail('GAME_OVER', 'The match has finished.')
  if (state.status !== 'match_over') {
    return fail('INVALID_ACTION', 'The match is not over yet.')
  }
  if (!state.playerOrder.includes(playerId)) {
    return fail('INVALID_ACTION', 'You are not in this match.')
  }
  const next = clone(state)
  next.status = 'finished'
  next.currentPlayerId = undefined
  return { ok: true, state: next }
}

/**
 * Remove a player mid-match (disconnect/leave): they forfeit any current bets
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
