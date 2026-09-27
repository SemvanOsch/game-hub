/**
 * Pure, authoritative Skip-Bo rules — no React, no networking, no I/O beyond an
 * injectable rng (deck shuffling) and an injected `now` (turn timer). See
 * `RULES.md` for the exact rule definition this file implements.
 *
 * The authoritative {@link SkipBoGameState} holds server-only information: the
 * draw-pile order, the completed-pile reservoir, and every player's stock and
 * hand. NEVER send it to a client directly — use `getPlayerView` (see `view.ts`)
 * to produce a sanitized per-player view.
 *
 * Reducers are total and synchronous. The only time-based transition is the turn
 * timer, driven by the server via {@link nextTimeout} / {@link tickMatch}.
 */
import {
  BuildingCard,
  createSkipBoDeck,
  cardSatisfies,
  requiredValue,
  shuffle,
  type SkipBoCard
} from './cards'

/** Lifecycle phase of the match. */
export type SkipBoPhase = 'playing' | 'finished'

/**
 * Match length, chosen by the host in the lobby. Only the stockpile size differs:
 * a longer stock means a longer game. `long` is the default (standard Skip-Bo).
 */
export type GameLength = 'long' | 'short'

/** Per-match options chosen in the lobby before the game is created. */
export interface SkipBoGameOptions {
  gameLength?: GameLength
}

/** Narrow untrusted lobby options to concrete settings (long game by default). */
export function parseSkipBoOptions(raw: unknown): { gameLength: GameLength } {
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).gameLength === 'short') {
    return { gameLength: 'short' }
  }
  return { gameLength: 'long' }
}

/** Default per-turn time limit (ms). Generous; see `RULES.md` → "Turn timer". */
export const TURN_MS = 60_000

/** Hand size a player is drawn up to at the start of their turn. */
export const HAND_SIZE = 5

/** Number of shared building piles and per-player discard piles. */
export const BUILDING_PILES = 4
export const DISCARD_PILES = 4

/** Per-player match statistics (surfaced on the results screen). */
export interface SkipBoPlayerStats {
  cardsPlayed: number
  stockCleared: number
  buildingPilesCompleted: number
  skipBosPlayed: number
  turnsTaken: number
}

/** Authoritative per-player state. Contains the player's hidden stock + hand. */
export interface SkipBoServerPlayer {
  playerId: string
  /** Face-down stockpile; the top (only visible card) is the LAST element. */
  stock: SkipBoCard[]
  /** The player's private hand. */
  hand: SkipBoCard[]
  /** Four personal discard piles; each pile's top is its LAST element. */
  discards: SkipBoCard[][]
}

/** Authoritative server state. Contains hidden information. */
export interface SkipBoGameState {
  status: SkipBoPhase
  /** The match length chosen in the lobby (affects only stock size). */
  gameLength: GameLength
  playerOrder: string[]
  players: Record<string, SkipBoServerPlayer>
  /** Undrawn cards; top of the pile at the END of the array (pop to draw). */
  drawPile: SkipBoCard[]
  /** Cards from completed building piles, reshuffled into the draw pile when it
   *  empties (see `RULES.md` → "Draw-pile recycling"). */
  completed: SkipBoCard[]
  /** The four shared building piles (index 0–3), each built 1→12. */
  buildingPiles: BuildingCard[][]
  currentPlayerId: string
  turnNumber: number
  /** Epoch-ms the current turn began (for display). */
  turnStartedAt: number
  /** Epoch-ms at which the current turn times out. */
  turnDeadline: number
  winnerId?: string
  /** Short human-readable summary of the last event, for client messaging. */
  lastEvent?: string
  stats: Record<string, SkipBoPlayerStats>
}

export type ActionErrorCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER'

export type ActionResult =
  | { ok: true; state: SkipBoGameState }
  | { ok: false; code: ActionErrorCode; message: string }

function fail(code: ActionErrorCode, message: string): ActionResult {
  return { ok: false, code, message }
}

/** Deep clone so reducers never mutate their input (keeps them pure). */
function clone(state: SkipBoGameState): SkipBoGameState {
  return structuredClone(state)
}

/**
 * Cards each player receives in their stock, by table size and game length
 * (see `RULES.md`). Long: 30 (2–4 players) / 20 (5–6). Short: 20 / 15.
 */
export function stockSize(playerCount: number, gameLength: GameLength = 'long'): number {
  if (gameLength === 'short') return playerCount <= 4 ? 20 : 15
  return playerCount <= 4 ? 30 : 20
}

function emptyStats(): SkipBoPlayerStats {
  return {
    cardsPlayed: 0,
    stockCleared: 0,
    buildingPilesCompleted: 0,
    skipBosPlayed: 0,
    turnsTaken: 0
  }
}

// --- Draw helpers ----------------------------------------------------------

/**
 * Ensure the draw pile has cards if any exist anywhere in the reservoir: when the
 * draw pile is empty, shuffle the completed-pile reservoir into a fresh draw pile.
 * Mutates `state`. Returns false only when there is genuinely nothing left to draw.
 */
function refillDraw(state: SkipBoGameState, rng: () => number): boolean {
  if (state.drawPile.length > 0) return true
  if (state.completed.length === 0) return false
  state.drawPile = shuffle(state.completed, rng)
  state.completed = []
  return state.drawPile.length > 0
}

/** Draw the given player's hand up to {@link HAND_SIZE}, refilling as needed. */
function drawToFull(state: SkipBoGameState, player: SkipBoServerPlayer, rng: () => number): void {
  while (player.hand.length < HAND_SIZE) {
    if (!refillDraw(state, rng)) break
    player.hand.push(state.drawPile.pop() as SkipBoCard)
  }
}

// --- Turn helpers ----------------------------------------------------------

/** The player id `steps` seats after the current player (wraps around). */
function seatAfter(state: SkipBoGameState, steps: number): string {
  const order = state.playerOrder
  const n = order.length
  const idx = order.indexOf(state.currentPlayerId)
  return order[(((idx + steps) % n) + n) % n]
}

/**
 * Advance play to the next seat: bump the turn number, draw the new current
 * player up to a full hand, and (re)start the turn timer. Mutates `state`.
 */
function advanceTurn(state: SkipBoGameState, now: number, rng: () => number): void {
  state.currentPlayerId = seatAfter(state, 1)
  state.turnNumber += 1
  state.turnStartedAt = now
  state.turnDeadline = now + TURN_MS
  const next = state.players[state.currentPlayerId]
  if (next) {
    state.stats[next.playerId].turnsTaken += 1
    drawToFull(state, next, rng)
  }
}

// --- Game creation ---------------------------------------------------------

/**
 * Create a new match: shuffle a fresh deck, deal each player their stock, deal
 * the starting player a full hand, and open four empty building piles. The
 * starting player is the first in `playerOrder` (seat/join order — the same
 * convention every other GameHub game uses). See `RULES.md`.
 */
export function createGame(
  playerOrder: string[],
  options?: unknown,
  now: number = Date.now(),
  rng: () => number = Math.random
): SkipBoGameState {
  const { gameLength } = parseSkipBoOptions(options)
  const deck = shuffle(createSkipBoDeck(), rng)
  const players: Record<string, SkipBoServerPlayer> = {}
  const stats: Record<string, SkipBoPlayerStats> = {}
  const perStock = stockSize(playerOrder.length, gameLength)

  for (const id of playerOrder) {
    players[id] = {
      playerId: id,
      stock: [],
      hand: [],
      discards: Array.from({ length: DISCARD_PILES }, () => [])
    }
    stats[id] = emptyStats()
  }

  // Deal stocks round-robin so a short deck would fail loudly rather than
  // silently shorting one player (a full deck comfortably covers every table).
  for (let i = 0; i < perStock; i++) {
    for (const id of playerOrder) {
      players[id].stock.push(deck.pop() as SkipBoCard)
    }
  }

  const state: SkipBoGameState = {
    status: 'playing',
    gameLength,
    playerOrder: [...playerOrder],
    players,
    drawPile: deck,
    completed: [],
    buildingPiles: Array.from({ length: BUILDING_PILES }, () => []),
    currentPlayerId: playerOrder[0],
    turnNumber: 1,
    turnStartedAt: now,
    turnDeadline: now + TURN_MS,
    stats,
    lastEvent: undefined
  }

  // The starting player draws their opening hand (start of their turn).
  const first = state.players[playerOrder[0]]
  state.stats[first.playerId].turnsTaken += 1
  drawToFull(state, first, rng)
  return state
}

// --- Guards ----------------------------------------------------------------

function requireActiveTurn(state: SkipBoGameState, playerId: string): ActionResult | null {
  if (state.status === 'finished') return fail('GAME_OVER', 'The game has finished.')
  if (!state.players[playerId]) return fail('INVALID_ACTION', 'You are not in this game.')
  if (state.currentPlayerId !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  return null
}

// --- Play sources ----------------------------------------------------------

/** Where a played card comes from. */
export type PlaySource =
  | { source: 'stock' }
  | { source: 'hand'; cardId: string }
  | { source: 'discard'; discardIndex: number }

/**
 * Resolve the concrete top/hand card a {@link PlaySource} refers to for a player,
 * or an error if the reference is invalid (empty pile, card not in hand, bad
 * index). Does not remove the card.
 */
function resolveSource(
  player: SkipBoServerPlayer,
  from: PlaySource
): { ok: true; card: SkipBoCard } | { ok: false; message: string } {
  switch (from.source) {
    case 'stock': {
      const card = player.stock[player.stock.length - 1]
      if (!card) return { ok: false, message: 'Your stockpile is empty.' }
      return { ok: true, card }
    }
    case 'hand': {
      const card = player.hand.find((c) => c.id === from.cardId)
      if (!card) return { ok: false, message: 'That card is not in your hand.' }
      return { ok: true, card }
    }
    case 'discard': {
      if (from.discardIndex < 0 || from.discardIndex >= DISCARD_PILES) {
        return { ok: false, message: 'Invalid discard pile.' }
      }
      const pile = player.discards[from.discardIndex]
      const card = pile[pile.length - 1]
      if (!card) return { ok: false, message: 'That discard pile is empty.' }
      return { ok: true, card }
    }
  }
}

/** Remove and return the card a {@link PlaySource} refers to (assumes resolved). */
function takeSource(player: SkipBoServerPlayer, from: PlaySource): SkipBoCard {
  switch (from.source) {
    case 'stock':
      return player.stock.pop() as SkipBoCard
    case 'hand': {
      const idx = player.hand.findIndex((c) => c.id === from.cardId)
      return player.hand.splice(idx, 1)[0]
    }
    case 'discard':
      return player.discards[from.discardIndex].pop() as SkipBoCard
  }
}

// --- Actions ---------------------------------------------------------------

/**
 * Play a card from the current player's stock top, hand, or one of their discard
 * pile tops onto a building pile. The Skip-Bo wild is auto-assigned the required
 * value (there is never a meaningful choice — a pile requires exactly one value).
 *
 * The turn does NOT end here: the player keeps playing until they discard.
 * Emptying the hand by playing (not discarding) triggers an immediate redraw to a
 * full hand so the turn can continue. Emptying the stock wins the game at once.
 */
export function playCard(
  state: SkipBoGameState,
  playerId: string,
  from: PlaySource,
  buildingIndex: number,
  rng: () => number = Math.random
): ActionResult {
  const guard = requireActiveTurn(state, playerId)
  if (guard) return guard
  if (buildingIndex < 0 || buildingIndex >= BUILDING_PILES) {
    return fail('INVALID_ACTION', 'Invalid building pile.')
  }

  const resolved = resolveSource(state.players[playerId], from)
  if (!resolved.ok) return fail('INVALID_ACTION', resolved.message)

  const pile = state.buildingPiles[buildingIndex]
  const required = requiredValue(pile.length)
  if (!cardSatisfies(resolved.card, required)) {
    return fail('INVALID_ACTION', `That card cannot be played there (needs a ${required}).`)
  }

  const next = clone(state)
  const p = next.players[playerId]
  const card = takeSource(p, from)
  const built: BuildingCard = { ...card, playedAs: required }
  next.buildingPiles[buildingIndex].push(built)

  const stats = next.stats[playerId]
  stats.cardsPlayed += 1
  if (card.type === 'skipbo') stats.skipBosPlayed += 1
  if (from.source === 'stock') stats.stockCleared += 1

  next.lastEvent = describePlay(card, required, from.source)

  // Completed pile (reached 12): set its cards aside for later recycling and
  // reopen the slot.
  if (next.buildingPiles[buildingIndex].length >= 12) {
    const done = next.buildingPiles[buildingIndex]
    next.completed.push(...done.map((c) => ({ id: c.id, type: c.type, value: c.value })))
    next.buildingPiles[buildingIndex] = []
    stats.buildingPilesCompleted += 1
    next.lastEvent = 'completed a building pile!'
  }

  // Win: emptying the stock ends the game immediately.
  if (p.stock.length === 0) {
    next.status = 'finished'
    next.winnerId = playerId
    next.lastEvent = 'emptied their stockpile and wins!'
    return { ok: true, state: next }
  }

  // Playing your whole hand (not by discarding) earns a fresh hand mid-turn.
  if (p.hand.length === 0) {
    drawToFull(next, p, rng)
    next.lastEvent = 'played their whole hand and drew five more.'
  }

  return { ok: true, state: next }
}

/**
 * End the turn by discarding exactly one hand card onto one of the player's four
 * discard piles, then advance play to the next seat.
 */
export function discard(
  state: SkipBoGameState,
  playerId: string,
  cardId: string,
  discardIndex: number,
  now: number = Date.now(),
  rng: () => number = Math.random
): ActionResult {
  const guard = requireActiveTurn(state, playerId)
  if (guard) return guard
  if (discardIndex < 0 || discardIndex >= DISCARD_PILES) {
    return fail('INVALID_ACTION', 'Invalid discard pile.')
  }
  const player = state.players[playerId]
  const idx = player.hand.findIndex((c) => c.id === cardId)
  if (idx < 0) return fail('INVALID_ACTION', 'That card is not in your hand.')

  const next = clone(state)
  const p = next.players[playerId]
  const card = p.hand.splice(idx, 1)[0]
  p.discards[discardIndex].push(card)
  next.lastEvent = 'discarded to end their turn.'
  advanceTurn(next, now, rng)
  return { ok: true, state: next }
}

// --- Messaging -------------------------------------------------------------

function describePlay(card: SkipBoCard, required: number, source: PlaySource['source']): string {
  const where = source === 'stock' ? ' from the stock' : ''
  if (card.type === 'skipbo') return `played a Skip-Bo as ${required}${where}.`
  return `played a ${card.value}${where}.`
}

// --- Server-driven timer ---------------------------------------------------

/** Next server timeout for this state (the current turn's deadline), or null. */
export function nextTimeout(state: SkipBoGameState): number | null {
  return state.status === 'playing' ? state.turnDeadline : null
}

/**
 * Time-based transition: once the current turn's deadline passes, force the turn
 * to end. Deterministic fallback (see `RULES.md` → "Turn-timer expiration"): the
 * player discards their first hand card onto their first discard pile; if their
 * hand is empty, the turn simply advances. Never leaves the match stuck.
 */
export function tickMatch(
  state: SkipBoGameState,
  now: number,
  rng: () => number = Math.random
): SkipBoGameState {
  if (state.status !== 'playing') return state
  if (now < state.turnDeadline) return state

  const next = clone(state)
  const p = next.players[next.currentPlayerId]
  if (p && p.hand.length > 0) {
    const card = p.hand.shift() as SkipBoCard
    p.discards[0].push(card)
    next.lastEvent = 'ran out of time — auto-discarded.'
  } else {
    next.lastEvent = 'ran out of time.'
  }
  advanceTurn(next, now, rng)
  return next
}

// --- Disconnect / leave ----------------------------------------------------

/**
 * Remove a player mid-match (disconnect/leave): their stock, hand and discards
 * leave play (their stock is dropped into the completed reservoir so those cards
 * can still recycle into the draw pile). If it was their turn, control passes to
 * the next seat. If only one player remains, they win. Returns null if nobody
 * remains.
 */
export function removePlayerFromGame(
  state: SkipBoGameState,
  playerId: string,
  now: number = Date.now(),
  rng: () => number = Math.random
): SkipBoGameState | null {
  if (!state.playerOrder.includes(playerId)) return state
  const next = clone(state)
  const wasCurrent = next.currentPlayerId === playerId

  // Recycle the leaver's face-down cards into the completed reservoir so the
  // draw pile can still be rebuilt from them; keep everything else intact.
  const leaver = next.players[playerId]
  if (leaver) {
    const loose = [...leaver.hand, ...leaver.stock, ...leaver.discards.flat()]
    next.completed.push(...loose.map((c) => ({ id: c.id, type: c.type, value: c.value })))
  }

  // Compute the successor BEFORE removing, if the leaver is on the clock.
  let successor: string | undefined
  if (wasCurrent && next.status !== 'finished') {
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
    next.lastEvent = 'wins — everyone else left.'
    return next
  }

  if (wasCurrent) {
    next.currentPlayerId =
      successor && next.players[successor] ? successor : next.playerOrder[0]
    next.turnNumber += 1
    next.turnStartedAt = now
    next.turnDeadline = now + TURN_MS
    const cur = next.players[next.currentPlayerId]
    if (cur) {
      next.stats[cur.playerId].turnsTaken += 1
      drawToFull(next, cur, rng)
    }
  }
  return next
}
