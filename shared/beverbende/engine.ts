/**
 * Pure, authoritative Beverbende rules — no React, no networking, no I/O beyond an
 * injectable rng (shuffling) and an injected `now` (phase/turn timers). See
 * `RULES.md` for the exact rule definition this file implements.
 *
 * The authoritative {@link BeverbendeState} holds server-only information: the full
 * draw-pile order and EVERY player's four card identities. NEVER send it to a client
 * directly — use `getPlayerView` (see `view.ts`) to produce a sanitized per-player
 * view that omits card identities the player may not know.
 *
 * Reducers are total, synchronous and pure (they clone before mutating). The only
 * time-based transitions are the reveal window, the per-turn timeout and the
 * between-rounds pause, all driven by the server via {@link nextTimeout} / {@link tick}.
 */
import { createBeverbendeDeck, isSpecial, shuffle, type BeverbendeCard } from './cards'

/** Number of face-down cards each player holds. */
export const HAND_POSITIONS = 4
/** Positions a player privately learns at the start of a round (the outer two). */
export const INITIAL_KNOWN_POSITIONS = [0, HAND_POSITIONS - 1] as const

/** Reveal (memorise) window before play begins, ms. Generous: it is only a safety
 *  fallback so one idle player cannot stall the table — each player normally ends
 *  their own reveal by pressing Ready (which hides their cards immediately). */
export const REVEAL_MS = 90_000
/** Per-turn time limit, ms (safety against an idle but connected player). */
export const TURN_MS = 45_000
/** Between-rounds scoreboard pause, ms. */
export const ROUND_OVER_MS = 8_000

/** Round-count bounds the host may choose in the lobby (see `RULES.md`). */
export const MIN_ROUNDS = 2
export const MAX_ROUNDS = 6
export const DEFAULT_ROUNDS = 5

export type BeverbendePhase = 'reveal' | 'playing' | 'roundOver' | 'finished'

/** Per-match options chosen in the lobby before the game is created. */
export interface BeverbendeGameOptions {
  rounds?: number
}

/** Narrow untrusted lobby options to a concrete round count (default 5, clamped). */
export function parseBeverbendeOptions(raw: unknown): { rounds: number } {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).rounds : undefined
  if (typeof r === 'number' && Number.isInteger(r)) {
    return { rounds: Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, r)) }
  }
  return { rounds: DEFAULT_ROUNDS }
}

/**
 * The current player's in-turn sub-state. `null` means they are at the start of
 * their turn (choose Action A, Action B or knock). Only ever set for the current
 * player during the `playing` phase.
 */
export type Pending =
  | { kind: 'decide'; card: BeverbendeCard; drawTwoStage?: 1 | 2 }
  | { kind: 'peek' }
  | { kind: 'swap' }

/** Authoritative per-player state. Holds the player's four card identities. */
export interface BeverbendeServerPlayer {
  playerId: string
  /** Exactly four cards (positions 0–3). */
  cards: BeverbendeCard[]
  /** Whether the OWNER currently knows their own card at each position. */
  known: boolean[]
  /** Pressed "Ready" during the reveal phase. */
  ready: boolean
  cumulativeScore: number
  /** Score from the most recently completed round (null until first scored). */
  roundScore: number | null
}

/** Authoritative server state. Contains hidden information. */
export interface BeverbendeState {
  status: BeverbendePhase
  totalRounds: number
  /** 1-based current round number. */
  round: number
  playerOrder: string[]
  players: Record<string, BeverbendeServerPlayer>
  /** Undrawn cards; top of the pile is the LAST element (pop to draw). */
  drawPile: BeverbendeCard[]
  /** Face-up discard; top is the LAST element. */
  discardPile: BeverbendeCard[]
  currentPlayerId: string
  pending: Pending | null
  /** Seat index (into the round's player order) that started the current round. */
  startingPlayerIndex: number
  /** Completed turns this round — gates the earliest a player may knock. */
  turnsThisRound: number
  /** The player who declared the last round, or null. */
  roundEndingPlayerId: string | null
  /** Remaining final turns after a knock (null until someone knocks). */
  finalTurnsLeft: number | null
  /** Epoch-ms the server should next {@link tick} this state (phase/turn timer). */
  deadline: number
  /** Epoch-ms the current turn began (display only). */
  turnStartedAt: number
  /** Per-player scores of the round shown on the roundOver scoreboard. */
  roundScores?: Record<string, number>
  winnerIds?: string[]
  /** Short human-readable summary of the last event, for client messaging. */
  lastEvent?: string
  /** Player id the last event is attributed to (undefined for round/system events).
   *  The turn may already have advanced, so this — not `currentPlayerId` — names the
   *  actor for UI messages/animations. */
  lastActorId?: string
  /** The two slots involved in the most recent swap, for a client cross-table
   *  animation. Only the positions are shared (never the card identities), and it is
   *  present only on the state produced by that swap. */
  lastSwap?: { aId: string; aPos: number; bId: string; bPos: number }
}

export type ActionErrorCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER'
export type ActionResult =
  | { ok: true; state: BeverbendeState }
  | { ok: false; code: ActionErrorCode; message: string }

function fail(code: ActionErrorCode, message: string): ActionResult {
  return { ok: false, code, message }
}

/** Record the last event message and the player it is attributed to. Clears any
 *  transient per-event metadata (e.g. `lastSwap`) so it only rides its own event. */
function setEvent(state: BeverbendeState, actorId: string | undefined, text: string): void {
  state.lastEvent = text
  state.lastActorId = actorId
  state.lastSwap = undefined
}

/** Deep clone so reducers never mutate their input (keeps them pure). */
function clone(state: BeverbendeState): BeverbendeState {
  return structuredClone(state)
}

// --- Draw / discard helpers ------------------------------------------------

/**
 * Ensure the draw pile has a card, refilling from the discard pile (all but its
 * current top) when empty. Mutates `state`. Returns false only when there is
 * genuinely nothing left to draw anywhere.
 */
function refillDraw(state: BeverbendeState, rng: () => number): boolean {
  if (state.drawPile.length > 0) return true
  if (state.discardPile.length <= 1) return false
  const top = state.discardPile.pop() as BeverbendeCard
  state.drawPile = shuffle(state.discardPile, rng)
  state.discardPile = [top]
  return state.drawPile.length > 0
}

/** Pop the top draw card, refilling from the discard first if needed. Null if none. */
function drawCard(state: BeverbendeState, rng: () => number): BeverbendeCard | null {
  if (!refillDraw(state, rng)) return null
  return state.drawPile.pop() as BeverbendeCard
}

// --- Round setup -----------------------------------------------------------

/**
 * Deal a fresh round: shuffle a new deck, give each player four cards (outer two
 * known to their owner), build the draw pile and flip a NUMBER card to start the
 * discard (special cards are buried and re-flipped, per `RULES.md`). Mutates
 * `state` in place with the new round's tableau; leaves cumulative scores intact.
 */
function dealRound(state: BeverbendeState, now: number, rng: () => number): void {
  const deck = shuffle(createBeverbendeDeck(), rng)
  for (const id of state.playerOrder) {
    const cards: BeverbendeCard[] = []
    for (let i = 0; i < HAND_POSITIONS; i++) cards.push(deck.pop() as BeverbendeCard)
    const p = state.players[id]
    p.cards = cards
    p.known = Array.from({ length: HAND_POSITIONS }, (_, i) =>
      (INITIAL_KNOWN_POSITIONS as readonly number[]).includes(i)
    )
    p.ready = false
    p.roundScore = null
  }

  // Flip a number card to start the discard; bury specials at the bottom.
  let starter = deck.pop() as BeverbendeCard
  while (isSpecial(starter) && deck.length > 0) {
    deck.unshift(starter) // bury at the bottom of the draw pile
    starter = deck.pop() as BeverbendeCard
  }
  state.drawPile = deck
  state.discardPile = [starter]

  state.pending = null
  state.turnsThisRound = 0
  state.roundEndingPlayerId = null
  state.finalTurnsLeft = null
  state.currentPlayerId = state.playerOrder[state.startingPlayerIndex % state.playerOrder.length]
  state.status = 'reveal'
  state.deadline = now + REVEAL_MS
  state.turnStartedAt = now
  state.roundScores = undefined
  state.lastEvent = undefined
}

/**
 * Create a new match. The first round's starting player is the first seat
 * (join/seat order — the convention every GameHub game uses); it rotates one seat
 * per round thereafter.
 */
export function createGame(
  playerOrder: string[],
  options?: unknown,
  now: number = Date.now(),
  rng: () => number = Math.random
): BeverbendeState {
  const { rounds } = parseBeverbendeOptions(options)
  const players: Record<string, BeverbendeServerPlayer> = {}
  for (const id of playerOrder) {
    players[id] = {
      playerId: id,
      cards: [],
      known: [],
      ready: false,
      cumulativeScore: 0,
      roundScore: null
    }
  }
  const state: BeverbendeState = {
    status: 'reveal',
    totalRounds: rounds,
    round: 1,
    playerOrder: [...playerOrder],
    players,
    drawPile: [],
    discardPile: [],
    currentPlayerId: playerOrder[0],
    pending: null,
    startingPlayerIndex: 0,
    turnsThisRound: 0,
    roundEndingPlayerId: null,
    finalTurnsLeft: null,
    deadline: now + REVEAL_MS,
    turnStartedAt: now
  }
  dealRound(state, now, rng)
  return state
}

// --- Guards ----------------------------------------------------------------

function requirePlaying(state: BeverbendeState, playerId: string): ActionResult | null {
  if (state.status === 'finished') return fail('GAME_OVER', 'The game has finished.')
  if (!state.players[playerId]) return fail('INVALID_ACTION', 'You are not in this game.')
  if (state.status !== 'playing') return fail('INVALID_ACTION', 'You cannot act right now.')
  if (state.currentPlayerId !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  return null
}

function isValidPosition(i: unknown): i is number {
  return typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < HAND_POSITIONS
}

// --- Turn advancement ------------------------------------------------------

function seatAfter(state: BeverbendeState, playerId: string, steps: number): string {
  const order = state.playerOrder
  const n = order.length
  const idx = order.indexOf(playerId)
  return order[(((idx + steps) % n) + n) % n]
}

/**
 * End the current player's turn: clear the pending sub-state, count the turn, and
 * either advance to the next seat or — if the final-turn sequence is complete —
 * score the round. Mutates `state`.
 */
function endTurn(state: BeverbendeState, now: number, rng: () => number): void {
  state.pending = null
  state.turnsThisRound += 1

  // Mid final-turn sequence: each other player takes exactly one turn.
  if (state.finalTurnsLeft !== null) {
    state.finalTurnsLeft -= 1
    if (state.finalTurnsLeft <= 0) {
      scoreRound(state, now, rng)
      return
    }
  }

  state.currentPlayerId = seatAfter(state, state.currentPlayerId, 1)
  state.turnStartedAt = now
  state.deadline = now + TURN_MS
}

// --- Scoring & round progression ------------------------------------------

/**
 * Score the just-finished round: replace every remaining special card in each row
 * with drawn number cards, sum each row, add to cumulative totals, then either open
 * the next round (after a scoreboard pause) or finish the game.
 */
function scoreRound(state: BeverbendeState, now: number, rng: () => number): void {
  const roundScores: Record<string, number> = {}
  for (const id of state.playerOrder) {
    const p = state.players[id]
    // Replace any leftover specials with number cards (draw until four numbers).
    for (let i = 0; i < p.cards.length; i++) {
      let guard = 0
      while (isSpecial(p.cards[i]) && guard < 200) {
        const replacement = drawCard(state, rng)
        if (!replacement) break
        state.discardPile.push(p.cards[i]) // the replaced special is discarded
        p.cards[i] = replacement
        guard++
      }
      p.known[i] = true // everything is revealed at scoring
    }
    const score = p.cards.reduce((sum, c) => sum + (c.type === 'number' ? c.value : 0), 0)
    p.roundScore = score
    p.cumulativeScore += score
    roundScores[id] = score
  }
  state.roundScores = roundScores
  state.pending = null

  if (state.round >= state.totalRounds) {
    state.status = 'finished'
    state.winnerIds = computeWinners(state)
    state.deadline = now
    setEvent(state, undefined, 'Final round scored.')
  } else {
    state.status = 'roundOver'
    state.deadline = now + ROUND_OVER_MS
    setEvent(state, undefined, `Round ${state.round} scored.`)
  }
}

/** Player id(s) with the lowest cumulative score (ties share the win). */
export function computeWinners(state: BeverbendeState): string[] {
  let best = Infinity
  for (const id of state.playerOrder) best = Math.min(best, state.players[id].cumulativeScore)
  return state.playerOrder.filter((id) => state.players[id].cumulativeScore === best)
}

/** Advance from the roundOver scoreboard into the next round (rotates the dealer). */
function startNextRound(state: BeverbendeState, now: number, rng: () => number): void {
  state.round += 1
  state.startingPlayerIndex = (state.startingPlayerIndex + 1) % state.playerOrder.length
  dealRound(state, now, rng)
}

// --- Actions: lifecycle ----------------------------------------------------

/** Mark a player ready during the reveal phase; start play once everyone is. */
export function markReady(
  state: BeverbendeState,
  playerId: string,
  now: number = Date.now()
): ActionResult {
  if (state.status !== 'reveal') return fail('INVALID_ACTION', 'Not in the reveal phase.')
  if (!state.players[playerId]) return fail('INVALID_ACTION', 'You are not in this game.')
  const next = clone(state)
  next.players[playerId].ready = true
  if (next.playerOrder.every((id) => next.players[id].ready)) {
    beginPlaying(next, now)
  }
  return { ok: true, state: next }
}

function beginPlaying(state: BeverbendeState, now: number): void {
  state.status = 'playing'
  state.turnStartedAt = now
  state.deadline = now + TURN_MS
  state.lastEvent = undefined
}

// --- Actions: taking a turn ------------------------------------------------

/**
 * Action A — take the face-up top of the discard pile (must be a NUMBER card) and
 * swap it into one of your positions; the replaced card goes face-up to the discard.
 */
export function takeDiscard(
  state: BeverbendeState,
  playerId: string,
  position: number,
  now: number = Date.now(),
  rng: () => number = Math.random
): ActionResult {
  const guard = requirePlaying(state, playerId)
  if (guard) return guard
  if (state.pending) return fail('INVALID_ACTION', 'Finish your current action first.')
  if (!isValidPosition(position)) return fail('INVALID_ACTION', 'Invalid card position.')
  const top = state.discardPile[state.discardPile.length - 1]
  if (!top) return fail('INVALID_ACTION', 'The discard pile is empty.')
  if (isSpecial(top)) return fail('INVALID_ACTION', 'You cannot take a power card from the discard.')

  const next = clone(state)
  const p = next.players[playerId]
  const taken = next.discardPile.pop() as BeverbendeCard
  const old = p.cards[position]
  p.cards[position] = taken
  p.known[position] = true // the taken card was face-up and public
  next.discardPile.push(old)
  setEvent(next, playerId, 'took a card from the discard pile.')
  endTurn(next, now, rng)
  return { ok: true, state: next }
}

/** Action B — draw the top of the draw pile; you then resolve it (see below). */
export function drawFromPile(
  state: BeverbendeState,
  playerId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): ActionResult {
  const guard = requirePlaying(state, playerId)
  if (guard) return guard
  if (state.pending) return fail('INVALID_ACTION', 'Finish your current action first.')

  const next = clone(state)
  const card = drawCard(next, rng)
  if (!card) {
    // Nothing left to draw — end the round now.
    scoreRound(next, now, rng)
    return { ok: true, state: next }
  }
  next.pending = { kind: 'decide', card }
  setEvent(next, playerId, 'drew from the draw pile.')
  return { ok: true, state: next }
}

/**
 * Knock — declare the final round. Allowed only at the start of your turn, only
 * after every player has had at least one turn this round, and only once.
 */
export function knock(
  state: BeverbendeState,
  playerId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): ActionResult {
  const guard = requirePlaying(state, playerId)
  if (guard) return guard
  if (state.pending) return fail('INVALID_ACTION', 'Finish your current action first.')
  if (state.roundEndingPlayerId) return fail('INVALID_ACTION', 'The last round is already called.')
  if (state.turnsThisRound < state.playerOrder.length) {
    return fail('INVALID_ACTION', 'Everyone must have had a turn before you can knock.')
  }

  const next = clone(state)
  next.roundEndingPlayerId = playerId
  // The knocker takes no further action; every OTHER player gets one last turn.
  // endTurn (below) decrements once for the knocker's own turn, so start at N: that
  // leaves exactly N-1 decrements — one per remaining player — before scoring.
  next.finalTurnsLeft = next.playerOrder.length
  setEvent(next, playerId, 'knocked — last round!')
  endTurn(next, now, rng)
  return { ok: true, state: next }
}

// --- Actions: resolving a drawn card --------------------------------------

/** Replace one of your cards with the pending drawn card (old card → discard). */
export function replaceWithDrawn(
  state: BeverbendeState,
  playerId: string,
  position: number,
  now: number = Date.now(),
  rng: () => number = Math.random
): ActionResult {
  const guard = requirePlaying(state, playerId)
  if (guard) return guard
  if (!state.pending || state.pending.kind !== 'decide') {
    return fail('INVALID_ACTION', 'You have no drawn card to place.')
  }
  if (!isValidPosition(position)) return fail('INVALID_ACTION', 'Invalid card position.')

  const next = clone(state)
  const p = next.players[playerId]
  const pending = next.pending as { kind: 'decide'; card: BeverbendeCard }
  const old = p.cards[position]
  p.cards[position] = pending.card
  p.known[position] = true // you saw the drawn card you placed
  next.discardPile.push(old)
  setEvent(next, playerId, 'swapped a drawn card into their row.')
  endTurn(next, now, rng)
  return { ok: true, state: next }
}

/**
 * Discard the pending drawn card unused. For the FIRST card of a Draw-Two this
 * declines it and draws the second (which must then be resolved); otherwise it
 * ends the turn.
 */
export function discardDrawn(
  state: BeverbendeState,
  playerId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): ActionResult {
  const guard = requirePlaying(state, playerId)
  if (guard) return guard
  if (!state.pending || state.pending.kind !== 'decide') {
    return fail('INVALID_ACTION', 'You have no drawn card to discard.')
  }

  const next = clone(state)
  const pending = next.pending as { kind: 'decide'; card: BeverbendeCard; drawTwoStage?: 1 | 2 }
  next.discardPile.push(pending.card)

  if (pending.drawTwoStage === 1) {
    // Declined the first Draw-Two card — draw the second, which must be resolved.
    const second = drawCard(next, rng)
    if (!second) {
      next.pending = null
      scoreRound(next, now, rng)
      return { ok: true, state: next }
    }
    next.pending = { kind: 'decide', card: second, drawTwoStage: 2 }
    setEvent(next, playerId, 'declined the first card and drew a second.')
    return { ok: true, state: next }
  }

  setEvent(next, playerId, 'discarded a drawn card.')
  endTurn(next, now, rng)
  return { ok: true, state: next }
}

/**
 * Use the pending drawn SPECIAL card's action. The special card is discarded and a
 * follow-up sub-state opens (peek/swap selection, or the first Draw-Two draw).
 */
export function useSpecial(
  state: BeverbendeState,
  playerId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): ActionResult {
  const guard = requirePlaying(state, playerId)
  if (guard) return guard
  if (!state.pending || state.pending.kind !== 'decide') {
    return fail('INVALID_ACTION', 'You have no drawn card.')
  }
  const card = state.pending.card
  if (card.type === 'number') return fail('INVALID_ACTION', 'That card has no action.')

  const next = clone(state)
  next.discardPile.push(card)

  switch (card.type) {
    case 'peek':
      next.pending = { kind: 'peek' }
      setEvent(next, playerId, 'is peeking at one of their cards.')
      return { ok: true, state: next }
    case 'swap':
      next.pending = { kind: 'swap' }
      setEvent(next, playerId, 'is swapping a card.')
      return { ok: true, state: next }
    case 'drawTwo': {
      const first = drawCard(next, rng)
      if (!first) {
        next.pending = null
        scoreRound(next, now, rng)
        return { ok: true, state: next }
      }
      next.pending = { kind: 'decide', card: first, drawTwoStage: 1 }
      setEvent(next, playerId, 'played Draw Two.')
      return { ok: true, state: next }
    }
    default:
      return fail('INVALID_ACTION', 'Unknown special card.')
  }
}

/** Resolve a pending Peek: privately learn one of your own cards; ends the turn. */
export function peekAt(
  state: BeverbendeState,
  playerId: string,
  position: number,
  now: number = Date.now(),
  rng: () => number = Math.random
): ActionResult {
  const guard = requirePlaying(state, playerId)
  if (guard) return guard
  if (!state.pending || state.pending.kind !== 'peek') {
    return fail('INVALID_ACTION', 'You have no peek to resolve.')
  }
  if (!isValidPosition(position)) return fail('INVALID_ACTION', 'Invalid card position.')

  const next = clone(state)
  next.players[playerId].known[position] = true // the card stays; owner now knows it
  setEvent(next, playerId, 'peeked at one of their cards.')
  endTurn(next, now, rng)
  return { ok: true, state: next }
}

/**
 * Resolve a pending Swap: exchange your card at `ownPosition` with `targetId`'s card
 * at `targetPosition`, blind. Both affected positions become unknown to their owners
 * (knowledge is positional — see `RULES.md`). Ends the turn.
 */
export function swapCards(
  state: BeverbendeState,
  playerId: string,
  ownPosition: number,
  targetId: string,
  targetPosition: number,
  now: number = Date.now(),
  rng: () => number = Math.random
): ActionResult {
  const guard = requirePlaying(state, playerId)
  if (guard) return guard
  if (!state.pending || state.pending.kind !== 'swap') {
    return fail('INVALID_ACTION', 'You have no swap to resolve.')
  }
  if (!isValidPosition(ownPosition) || !isValidPosition(targetPosition)) {
    return fail('INVALID_ACTION', 'Invalid card position.')
  }
  if (targetId === playerId) return fail('INVALID_ACTION', 'You must swap with another player.')
  const target = state.players[targetId]
  if (!target || !state.playerOrder.includes(targetId)) {
    return fail('INVALID_ACTION', 'That player is not in the game.')
  }

  const next = clone(state)
  const me = next.players[playerId]
  const them = next.players[targetId]
  const mine = me.cards[ownPosition]
  me.cards[ownPosition] = them.cards[targetPosition]
  them.cards[targetPosition] = mine
  // Positional knowledge resets: neither owner automatically knows the new card.
  me.known[ownPosition] = false
  them.known[targetPosition] = false
  setEvent(next, playerId, 'swapped a card with an opponent.')
  next.lastSwap = { aId: playerId, aPos: ownPosition, bId: targetId, bPos: targetPosition }
  endTurn(next, now, rng)
  return { ok: true, state: next }
}

// --- Server-driven timer ---------------------------------------------------

/** Next server timeout for this state, or null when nothing is time-pending. */
export function nextTimeout(state: BeverbendeState): number | null {
  return state.status === 'finished' ? null : state.deadline
}

/**
 * Time-based transitions once the wall clock passes {@link nextTimeout}:
 *   - reveal → start play (whoever wasn't ready simply loses the extra look);
 *   - roundOver → deal the next round;
 *   - playing → force the idle current player's turn to end deterministically.
 * Never leaves the match stuck.
 */
export function tick(
  state: BeverbendeState,
  now: number,
  rng: () => number = Math.random
): BeverbendeState {
  if (state.status === 'finished') return state
  if (now < state.deadline) return state

  const next = clone(state)
  switch (next.status) {
    case 'reveal':
      beginPlaying(next, now)
      return next
    case 'roundOver':
      startNextRound(next, now, rng)
      return next
    case 'playing': {
      // Safe auto-resolution for an idle turn: abandon any pending sub-state
      // (the pending drawn card, if any, is discarded) and end the turn.
      if (next.pending && next.pending.kind === 'decide') {
        next.discardPile.push(next.pending.card)
      }
      next.pending = null
      setEvent(next, next.currentPlayerId, 'ran out of time.')
      endTurn(next, now, rng)
      return next
    }
    default:
      return next
  }
}

// --- Disconnect / leave ----------------------------------------------------

/**
 * Remove a player mid-match (disconnect/leave): their cards leave play (dropped into
 * the discard so they can still recycle into the draw pile), and turn / knock state
 * is repaired. If it was their turn, control passes to the next seat. If fewer than
 * two players remain, the game finishes with the survivor(s) as winners. Returns null
 * if nobody remains.
 */
export function removePlayerFromGame(
  state: BeverbendeState,
  playerId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): BeverbendeState | null {
  if (!state.playerOrder.includes(playerId)) return state
  const next = clone(state)
  const wasCurrent = next.currentPlayerId === playerId
  const idx = next.playerOrder.indexOf(playerId)

  const leaver = next.players[playerId]
  if (leaver) next.discardPile.push(...leaver.cards)

  // Successor before removal, if the leaver was on the clock.
  let successor: string | undefined
  if (wasCurrent && next.status === 'playing') {
    successor = seatAfter(next, playerId, 1)
    if (successor === playerId) successor = undefined
  }
  // If the knocker leaves, their declared last round still stands but they need no
  // final turn; reduce the outstanding final turns to the players who remain.
  if (next.roundEndingPlayerId === playerId) {
    next.roundEndingPlayerId = null
  }

  next.playerOrder = next.playerOrder.filter((id) => id !== playerId)
  delete next.players[playerId]
  if (next.playerOrder.length === 0) return null

  // Keep the starting-seat index in range after the seat is removed.
  if (idx <= next.startingPlayerIndex && next.startingPlayerIndex > 0) {
    next.startingPlayerIndex -= 1
  }
  next.startingPlayerIndex %= next.playerOrder.length

  if (next.status === 'finished') return next

  // Fewer than two players cannot continue — finish with the survivor(s) winning.
  if (next.playerOrder.length < 2) {
    next.status = 'finished'
    next.winnerIds = next.playerOrder.slice()
    next.currentPlayerId = next.playerOrder[0]
    next.pending = null
    setEvent(next, next.playerOrder[0], 'wins — everyone else left.')
    return next
  }

  if (next.finalTurnsLeft !== null) {
    next.finalTurnsLeft = Math.max(0, Math.min(next.finalTurnsLeft, next.playerOrder.length))
  }

  if (wasCurrent && next.status === 'playing') {
    next.pending = null
    if (next.finalTurnsLeft !== null && next.finalTurnsLeft <= 0) {
      scoreRound(next, now, rng)
      return next
    }
    next.currentPlayerId =
      successor && next.players[successor] ? successor : next.playerOrder[0]
    next.turnStartedAt = now
    next.deadline = now + TURN_MS
  }
  return next
}
