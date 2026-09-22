/**
 * Pure, authoritative UNO rules — no React, no networking, no I/O beyond
 * Math.random (deck shuffling). See `RULES.md` for the exact rule definition
 * this file implements.
 *
 * The authoritative {@link UnoGameState} holds server-only information: the draw
 * pile order and every player's hand. NEVER send it to a client directly — use
 * `getPlayerView` (see `view.ts`) to produce a sanitized per-player view that
 * contains only the recipient's own hand plus public table state.
 *
 * The reducers are total and synchronous. There are no server timers: the UNO
 * catch window is bounded by turn transitions, not wall-clock time (see
 * `RULES.md` → "UNO call & penalty").
 */
import {
  createUnoDeck,
  isWild,
  matchesTop,
  shuffle,
  UNO_COLORS,
  type UnoCard,
  type UnoColor
} from './cards'

/** Turn-flow / lifecycle phase of the match. */
export type UnoPhase = 'playing' | 'choosing_color' | 'finished'

/** Which draw card a pending stack is built from (they never mix). */
export type UnoStackType = 'draw_two' | 'wild_draw_four' | null

/** Per-match options chosen in the lobby before the game is created. */
export interface UnoGameOptions {
  /** When true, Draw Two / Wild Draw Four penalties can be stacked (see RULES.md). */
  stacking?: boolean
}

/** Narrow untrusted lobby options to concrete settings (stacking off by default). */
export function parseUnoOptions(raw: unknown): { stacking: boolean } {
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).stacking === true) {
    return { stacking: true }
  }
  return { stacking: false }
}

/** Authoritative per-player state. Contains the player's hidden hand. */
export interface UnoServerPlayer {
  playerId: string
  hand: UnoCard[]
  /** True once the player has safely declared UNO at one card. */
  saidUno: boolean
  /** True while the player is at one card WITHOUT having declared (catchable). */
  unoPenaltyPending: boolean
}

/** Direction of play: 1 = forward through playerOrder, -1 = backward. */
export type UnoDirection = 1 | -1

/** Authoritative server state. Contains hidden information (draw pile + hands). */
export interface UnoGameState {
  status: UnoPhase
  /** House rule: whether Draw Two / Wild Draw Four penalties may be stacked. */
  stacking: boolean
  /** Accumulated draw penalty a stacked chain has built up (0 when none). */
  pendingDraw: number
  /** The card type the current pending stack is built from (null when none). */
  pendingDrawType: UnoStackType
  playerOrder: string[]
  players: Record<string, UnoServerPlayer>
  /** Undrawn cards; top of the pile at the END of the array (pop to draw). */
  drawPile: UnoCard[]
  /** Played cards; the current top is the LAST element. */
  discardPile: UnoCard[]
  /** The colour that must currently be matched (a wild's chosen colour, or the
   *  top coloured card's colour). Never null during play. */
  activeColor: UnoColor
  direction: UnoDirection
  currentPlayerId: string
  /** During `choosing_color`, the player who must pick a colour. */
  pendingColorPlayerId?: string
  /** Set when the current player drew a PLAYABLE card and may now play it or pass. */
  drawnCardId?: string
  winnerId?: string
  /** Short human-readable summary of the last event, for client messaging. */
  lastEvent?: string
}

export type ActionErrorCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER'

export type ActionResult =
  | { ok: true; state: UnoGameState }
  | { ok: false; code: ActionErrorCode; message: string }

function fail(code: ActionErrorCode, message: string): ActionResult {
  return { ok: false, code, message }
}

/** Deep clone so reducers never mutate their input (keeps them pure). */
function clone(state: UnoGameState): UnoGameState {
  return structuredClone(state)
}

// --- Deck / draw helpers ---------------------------------------------------

/** The current top card of the discard pile. */
export function topCard(state: UnoGameState): UnoCard {
  return state.discardPile[state.discardPile.length - 1]
}

/**
 * Ensure at least one card is drawable: if the draw pile is empty, shuffle every
 * discard EXCEPT the current top back into a fresh draw pile. Mutates `state`.
 * Returns false only if there is genuinely nothing left to draw anywhere.
 */
function refillIfNeeded(state: UnoGameState): boolean {
  if (state.drawPile.length > 0) return true
  if (state.discardPile.length <= 1) return false
  const top = state.discardPile.pop() as UnoCard
  state.drawPile = shuffle(state.discardPile)
  state.discardPile = [top]
  return state.drawPile.length > 0
}

/** Draw up to `n` cards from the top of the draw pile into `player`'s hand. */
function drawInto(state: UnoGameState, player: UnoServerPlayer, n: number): void {
  for (let i = 0; i < n; i++) {
    if (!refillIfNeeded(state)) break
    player.hand.push(state.drawPile.pop() as UnoCard)
  }
  // Any draw takes a player off the one-card cliff, so their UNO flags reset.
  syncUnoFlags(player)
}

/**
 * Keep a player's UNO flags consistent with their hand size. Only a play that
 * lands ON one card decides `saidUno` / `unoPenaltyPending`; any other hand size
 * clears both.
 */
function syncUnoFlags(player: UnoServerPlayer): void {
  if (player.hand.length !== 1) {
    player.saidUno = false
    player.unoPenaltyPending = false
  }
}

// --- Turn helpers ----------------------------------------------------------

/** The player `steps` seats away from the current player, in the play direction. */
function seatAfter(state: UnoGameState, steps: number): string {
  const order = state.playerOrder
  const n = order.length
  const idx = order.indexOf(state.currentPlayerId)
  const next = (((idx + state.direction * steps) % n) + n) % n
  return order[next]
}

/**
 * Advance the turn by one seat (or two when `skip` is true), clearing the
 * transient drawn-card state. If the seat that becomes current was catchable for
 * a missed UNO call, they "got away with it" — their window closes.
 */
function advance(state: UnoGameState, skip: boolean): void {
  state.currentPlayerId = seatAfter(state, skip ? 2 : 1)
  state.drawnCardId = undefined
  const now = state.players[state.currentPlayerId]
  if (now) now.unoPenaltyPending = false
}

// --- Game creation ---------------------------------------------------------

/**
 * Create a new match: shuffle a fresh deck, deal 7 cards to each player, flip a
 * number card to open the discard, and set the first player. See `RULES.md`.
 */
export function createGame(playerOrder: string[], options?: unknown): UnoGameState {
  const { stacking } = parseUnoOptions(options)
  const players: Record<string, UnoServerPlayer> = {}
  for (const id of playerOrder) {
    players[id] = { playerId: id, hand: [], saidUno: false, unoPenaltyPending: false }
  }

  let deck = shuffle(createUnoDeck())

  // Deal 7 to each player (round-robin so a short deck fails loudly, though a
  // full deck comfortably covers 8×7 + opener).
  for (let round = 0; round < 7; round++) {
    for (const id of playerOrder) {
      players[id].hand.push(deck.pop() as UnoCard)
    }
  }

  // Opening discard must be a number card: set aside non-number flips, then
  // shuffle them back under the remaining deck so no cards are lost.
  const setAside: UnoCard[] = []
  let opener: UnoCard | undefined
  while (deck.length > 0) {
    const card = deck.pop() as UnoCard
    if (card.type === 'number') {
      opener = card
      break
    }
    setAside.push(card)
  }
  // Return the set-aside action/wild cards to the deck and reshuffle.
  deck = shuffle(deck.concat(setAside))

  // Fallback (astronomically unlikely with a standard deck): synthesise a red 0.
  const openCard: UnoCard = opener ?? { id: 'u-open', color: 'red', type: 'number', value: 0 }

  const state: UnoGameState = {
    status: 'playing',
    stacking,
    pendingDraw: 0,
    pendingDrawType: null,
    playerOrder: [...playerOrder],
    players,
    drawPile: deck,
    discardPile: [openCard],
    activeColor: (openCard.color as UnoColor) ?? 'red',
    direction: 1,
    currentPlayerId: playerOrder[0],
    lastEvent: undefined
  }
  return state
}

// --- Legality --------------------------------------------------------------

/** Does the player hold any card matching the active colour (excluding wilds)? */
function hasActiveColor(player: UnoServerPlayer, activeColor: UnoColor): boolean {
  return player.hand.some((c) => !isWild(c) && c.color === activeColor)
}

/**
 * Whether `card` is playable RIGHT NOW for `player`, including the Wild Draw Four
 * hand restriction. Used both by the reducer (authoritative) and to compute the
 * UX-only playable list in the view.
 */
export function isCardPlayable(
  state: UnoGameState,
  player: UnoServerPlayer,
  card: UnoCard
): boolean {
  const top = topCard(state)
  // Under a pending stack you may ONLY answer with a same-type draw card (or
  // absorb the whole stack by drawing). The Wild Draw Four colour restriction is
  // relaxed while stacking a response.
  if (state.pendingDraw > 0) {
    return card.type === state.pendingDrawType
  }
  if (card.type === 'wild_draw_four') {
    // Legal only when the player has no card matching the active colour.
    return !hasActiveColor(player, state.activeColor)
  }
  return matchesTop(card, top, state.activeColor)
}

/** Card ids in the player's hand that are legally playable this turn (UX only). */
export function playableCardIds(state: UnoGameState, playerId: string): string[] {
  const player = state.players[playerId]
  if (!player) return []
  if (state.status !== 'playing') return []
  if (state.currentPlayerId !== playerId) return []
  // After drawing a playable card, only that card may be played.
  if (state.drawnCardId) {
    return player.hand.some((c) => c.id === state.drawnCardId) ? [state.drawnCardId] : []
  }
  return player.hand.filter((c) => isCardPlayable(state, player, c)).map((c) => c.id)
}

// --- Guards ----------------------------------------------------------------

function requireActiveTurn(state: UnoGameState, playerId: string): ActionResult | null {
  if (state.status === 'finished') return fail('GAME_OVER', 'The game has finished.')
  if (state.status === 'choosing_color') {
    return fail('INVALID_ACTION', 'A colour is being chosen.')
  }
  if (!state.players[playerId]) return fail('INVALID_ACTION', 'You are not in this game.')
  if (state.currentPlayerId !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  return null
}

// --- Actions ---------------------------------------------------------------

/**
 * Play a card from the current player's hand.
 * @param cardId    the card to play (must be in hand and legal)
 * @param chosenColor optional colour, only for wilds; if omitted the game enters
 *                    the `choosing_color` phase and waits for `chooseColor`
 * @param declareUno  set when this play leaves the player on one card, to call UNO
 */
export function playCard(
  state: UnoGameState,
  playerId: string,
  cardId: string,
  chosenColor: UnoColor | undefined,
  declareUno: boolean
): ActionResult {
  const guard = requireActiveTurn(state, playerId)
  if (guard) return guard

  const player = state.players[playerId]
  const idx = player.hand.findIndex((c) => c.id === cardId)
  if (idx < 0) return fail('INVALID_ACTION', 'That card is not in your hand.')

  // If the player just drew, only the drawn card may be played.
  if (state.drawnCardId && state.drawnCardId !== cardId) {
    return fail('INVALID_ACTION', 'You may only play the card you just drew, or pass.')
  }

  const card = player.hand[idx]
  if (!isCardPlayable(state, player, card)) {
    return fail('INVALID_ACTION', 'That card cannot be played on the current pile.')
  }

  const next = clone(state)
  const p = next.players[playerId]
  const played = p.hand.splice(idx, 1)[0]
  next.discardPile.push(played)
  next.drawnCardId = undefined

  // Winning: emptying the hand ends the game immediately; action effects on the
  // final card are not applied (see RULES.md).
  if (p.hand.length === 0) {
    next.status = 'finished'
    next.winnerId = playerId
    next.currentPlayerId = playerId
    next.lastEvent = 'wins the round!'
    return { ok: true, state: next }
  }

  // Mark UNO state when this play lands the player on exactly one card.
  if (p.hand.length === 1) {
    p.saidUno = declareUno === true
    p.unoPenaltyPending = declareUno !== true
  } else {
    p.saidUno = false
    p.unoPenaltyPending = false
  }

  // Wilds need a colour before the turn advances.
  if (isWild(played)) {
    if (chosenColor && UNO_COLORS.includes(chosenColor)) {
      next.activeColor = chosenColor
      return { ok: true, state: applyPostPlay(next, played, playerId) }
    }
    next.status = 'choosing_color'
    next.pendingColorPlayerId = playerId
    next.lastEvent = 'played a Wild — choosing a colour…'
    return { ok: true, state: next }
  }

  // Coloured card: the active colour becomes the card's colour.
  next.activeColor = played.color as UnoColor
  return { ok: true, state: applyPostPlay(next, played, playerId) }
}

/**
 * Apply a played card's turn/penalty effect and advance play. Assumes the card
 * is already on the discard, the active colour is set, and the game is not over.
 */
function applyPostPlay(state: UnoGameState, played: UnoCard, playerId: string): UnoGameState {
  const twoPlayers = state.playerOrder.length === 2

  switch (played.type) {
    case 'skip':
      advance(state, true)
      break
    case 'reverse':
      state.direction = (state.direction * -1) as UnoDirection
      // With two players Reverse behaves like Skip (play returns to the mover).
      advance(state, twoPlayers)
      break
    case 'draw_two': {
      if (state.stacking) {
        // Build up the penalty and pass it to the next player, who must answer
        // with another Draw Two or absorb the whole stack.
        state.pendingDraw += 2
        state.pendingDrawType = 'draw_two'
        advance(state, false)
      } else {
        const target = state.players[seatAfter(state, 1)]
        if (target) drawInto(state, target, 2)
        advance(state, true)
      }
      break
    }
    case 'wild_draw_four': {
      if (state.stacking) {
        state.pendingDraw += 4
        state.pendingDrawType = 'wild_draw_four'
        advance(state, false)
      } else {
        const target = state.players[seatAfter(state, 1)]
        if (target) drawInto(state, target, 4)
        advance(state, true)
      }
      break
    }
    default:
      // Number or plain Wild: normal single-seat advance.
      advance(state, false)
  }

  state.lastEvent = describePlay(state, played, playerId)
  return state
}

/** Choose the active colour after playing a Wild / Wild Draw Four. */
export function chooseColor(
  state: UnoGameState,
  playerId: string,
  color: UnoColor
): ActionResult {
  if (state.status === 'finished') return fail('GAME_OVER', 'The game has finished.')
  if (state.status !== 'choosing_color' || state.pendingColorPlayerId !== playerId) {
    return fail('INVALID_ACTION', 'You cannot choose a colour right now.')
  }
  if (!UNO_COLORS.includes(color)) {
    return fail('INVALID_ACTION', 'Choose a valid colour.')
  }
  const next = clone(state)
  next.status = 'playing'
  next.pendingColorPlayerId = undefined
  next.activeColor = color
  const played = topCard(next)
  return { ok: true, state: applyPostPlay(next, played, playerId) }
}

/**
 * Draw a single card. If it is playable the player may then play it or `pass`;
 * otherwise the turn ends automatically.
 */
export function drawCard(state: UnoGameState, playerId: string): ActionResult {
  const guard = requireActiveTurn(state, playerId)
  if (guard) return guard
  if (state.drawnCardId) {
    return fail('INVALID_ACTION', 'You have already drawn — play the card or pass.')
  }
  const next = clone(state)
  const p = next.players[playerId]

  // Absorbing a pending stack: draw the whole accumulated penalty and end the
  // turn (the player is effectively skipped by the penalty).
  if (next.pendingDraw > 0) {
    const owed = next.pendingDraw
    drawInto(next, p, owed)
    next.pendingDraw = 0
    next.pendingDrawType = null
    advance(next, false)
    next.lastEvent = `drew ${owed} from the stack.`
    return { ok: true, state: next }
  }

  if (!refillIfNeeded(next)) {
    // Nothing to draw anywhere; the turn simply passes.
    advance(next, false)
    next.lastEvent = 'could not draw (deck empty) and passed.'
    return { ok: true, state: next }
  }
  const drawn = next.drawPile.pop() as UnoCard
  p.hand.push(drawn)
  syncUnoFlags(p)

  if (isCardPlayable(next, p, drawn)) {
    // Hold the turn: the player may play the drawn card or pass.
    next.drawnCardId = drawn.id
    next.lastEvent = 'drew a card.'
    return { ok: true, state: next }
  }
  // Not playable — turn ends.
  advance(next, false)
  next.lastEvent = 'drew a card and passed.'
  return { ok: true, state: next }
}

/** End the turn after having drawn a playable card (declining to play it). */
export function pass(state: UnoGameState, playerId: string): ActionResult {
  const guard = requireActiveTurn(state, playerId)
  if (guard) return guard
  if (!state.drawnCardId) {
    return fail('INVALID_ACTION', 'You can only pass after drawing a card.')
  }
  const next = clone(state)
  advance(next, false)
  next.lastEvent = 'passed.'
  return { ok: true, state: next }
}

/**
 * Declare UNO for yourself while you are catchable (at one card, not yet
 * declared). Safe against fake calls: does nothing meaningful otherwise.
 */
export function callUno(state: UnoGameState, playerId: string): ActionResult {
  if (state.status === 'finished') return fail('GAME_OVER', 'The game has finished.')
  const player = state.players[playerId]
  if (!player) return fail('INVALID_ACTION', 'You are not in this game.')
  if (player.hand.length !== 1) {
    return fail('INVALID_ACTION', 'You can only call UNO with one card left.')
  }
  if (player.saidUno) {
    return fail('INVALID_ACTION', 'You have already called UNO.')
  }
  const next = clone(state)
  const p = next.players[playerId]
  p.saidUno = true
  p.unoPenaltyPending = false
  next.lastEvent = 'called UNO!'
  return { ok: true, state: next }
}

/**
 * Catch another player who dropped to one card without declaring UNO. On a valid
 * catch the target draws two penalty cards. Rejected if the target is not
 * currently catchable (prevents fake / stale catches).
 */
export function catchUno(state: UnoGameState, callerId: string, targetId: string): ActionResult {
  if (state.status === 'finished') return fail('GAME_OVER', 'The game has finished.')
  if (!state.players[callerId]) return fail('INVALID_ACTION', 'You are not in this game.')
  if (callerId === targetId) return fail('INVALID_ACTION', 'You cannot catch yourself.')
  const target = state.players[targetId]
  if (!target || target.hand.length !== 1 || !target.unoPenaltyPending) {
    return fail('INVALID_ACTION', 'That player cannot be caught right now.')
  }
  const next = clone(state)
  const t = next.players[targetId]
  drawInto(next, t, 2)
  t.unoPenaltyPending = false
  t.saidUno = false
  next.lastEvent = 'was caught not saying UNO and drew 2!'
  return { ok: true, state: next }
}

// --- Messaging -------------------------------------------------------------

function describePlay(state: UnoGameState, played: UnoCard, playerId: string): string {
  void playerId
  switch (played.type) {
    case 'skip':
      return 'played Skip.'
    case 'reverse':
      return 'played Reverse.'
    case 'draw_two':
      return 'played Draw Two.'
    case 'wild':
      return `played Wild → ${state.activeColor}.`
    case 'wild_draw_four':
      return `played Wild Draw Four → ${state.activeColor}.`
    default:
      return `played ${state.activeColor} ${played.value}.`
  }
}

// --- Disconnect / leave ----------------------------------------------------

/**
 * Remove a player mid-match (disconnect/leave): their cards leave play. If it
 * was their turn, control passes to the next seat. If only one player remains,
 * they win. Returns null if nobody remains.
 */
export function removePlayerFromGame(state: UnoGameState, playerId: string): UnoGameState | null {
  if (!state.playerOrder.includes(playerId)) return state
  const next = clone(state)
  const wasCurrent = next.currentPlayerId === playerId
  const wasChoosing = next.status === 'choosing_color' && next.pendingColorPlayerId === playerId

  // Compute the seat that should act next BEFORE removing, if the leaver is on
  // the clock, so turn order stays natural.
  let successor: string | undefined
  if ((wasCurrent || wasChoosing) && next.status !== 'finished') {
    successor = seatAfter(next, 1)
    if (successor === playerId) successor = undefined
  }

  next.playerOrder = next.playerOrder.filter((id) => id !== playerId)
  delete next.players[playerId]
  if (next.playerOrder.length === 0) return null

  if (next.status === 'finished') return next

  // Last player standing wins.
  if (next.playerOrder.length === 1) {
    next.status = 'finished'
    next.winnerId = next.playerOrder[0]
    next.currentPlayerId = next.playerOrder[0]
    next.pendingColorPlayerId = undefined
    next.lastEvent = 'wins — everyone else left.'
    return next
  }

  if (wasCurrent || wasChoosing) {
    next.status = 'playing'
    next.pendingColorPlayerId = undefined
    next.drawnCardId = undefined
    next.currentPlayerId =
      successor && next.players[successor] ? successor : next.playerOrder[0]
  }
  return next
}

/** The player id whose turn it is (or who must choose a colour). */
export function currentPlayerId(state: UnoGameState): string {
  return state.pendingColorPlayerId ?? state.currentPlayerId
}
