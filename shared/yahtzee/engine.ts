import { ALL_CATEGORIES, CATEGORY_COUNT, type Category } from './categories'
import { DICE_COUNT, MAX_ROLLS, rerollDice, rollDice } from './dice'
import { calculateTotals, scoreCategory, type ScoreTotals } from './scoring'

export interface YahtzeeScorecard {
  /** Categories that have been scored. Absent = still available. */
  scores: Partial<Record<Category, number>>
}

export interface YahtzeeGameState {
  status: 'playing' | 'finished'
  /** Player ids in fixed turn order. */
  playerOrder: string[]
  currentPlayerIndex: number
  dice: number[]
  held: boolean[]
  /** How many times the current player has rolled this turn (0..MAX_ROLLS). */
  rollsUsed: number
  /** 1-based round counter (each player scores once per round). */
  round: number
  scorecards: Record<string, YahtzeeScorecard>
}

export type ActionErrorCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER'

export type ActionResult =
  | { ok: true; state: YahtzeeGameState }
  | { ok: false; code: ActionErrorCode; message: string }

function fail(code: ActionErrorCode, message: string): ActionResult {
  return { ok: false, code, message }
}

function freshTurn(): Pick<YahtzeeGameState, 'dice' | 'held' | 'rollsUsed'> {
  return {
    dice: Array<number>(DICE_COUNT).fill(0),
    held: Array<boolean>(DICE_COUNT).fill(false),
    rollsUsed: 0
  }
}

/** Create a new game for the given ordered list of player ids. */
export function createGame(playerOrder: string[]): YahtzeeGameState {
  const scorecards: Record<string, YahtzeeScorecard> = {}
  for (const id of playerOrder) {
    scorecards[id] = { scores: {} }
  }
  return {
    status: 'playing',
    playerOrder: [...playerOrder],
    currentPlayerIndex: 0,
    ...freshTurn(),
    round: 1,
    scorecards
  }
}

export function currentPlayerId(state: YahtzeeGameState): string {
  return state.playerOrder[state.currentPlayerIndex]
}

function ensureTurn(state: YahtzeeGameState, playerId: string): ActionResult | null {
  if (state.status !== 'playing') return fail('GAME_OVER', 'The game has already finished.')
  if (currentPlayerId(state) !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  return null
}

/** Roll (or reroll unheld) dice for the current player. */
export function rollDiceAction(state: YahtzeeGameState, playerId: string): ActionResult {
  const turnError = ensureTurn(state, playerId)
  if (turnError) return turnError
  if (state.rollsUsed >= MAX_ROLLS) {
    return fail('INVALID_ACTION', 'No rolls remaining this turn.')
  }

  const dice = state.rollsUsed === 0 ? rollDice() : rerollDice(state.dice, state.held)
  return {
    ok: true,
    state: { ...state, dice, rollsUsed: state.rollsUsed + 1 }
  }
}

/** Toggle whether a die is held between rolls. */
export function keepDieAction(
  state: YahtzeeGameState,
  playerId: string,
  index: number
): ActionResult {
  const turnError = ensureTurn(state, playerId)
  if (turnError) return turnError
  if (state.rollsUsed === 0) {
    return fail('INVALID_ACTION', 'You must roll before holding dice.')
  }
  if (state.rollsUsed >= MAX_ROLLS) {
    return fail('INVALID_ACTION', 'You cannot change held dice after your final roll.')
  }
  if (!Number.isInteger(index) || index < 0 || index >= state.dice.length) {
    return fail('INVALID_ACTION', 'Invalid die index.')
  }
  const held = state.held.slice()
  held[index] = !held[index]
  return { ok: true, state: { ...state, held } }
}

/** Score the current dice into a category and advance to the next player. */
export function submitScoreAction(
  state: YahtzeeGameState,
  playerId: string,
  category: Category
): ActionResult {
  const turnError = ensureTurn(state, playerId)
  if (turnError) return turnError
  if (state.rollsUsed === 0) {
    return fail('INVALID_ACTION', 'You must roll at least once before scoring.')
  }
  const card = state.scorecards[playerId]
  if (!card) return fail('INVALID_ACTION', 'Unknown player.')
  if (card.scores[category] !== undefined) {
    return fail('INVALID_ACTION', 'That category has already been scored.')
  }

  const points = scoreCategory(category, state.dice)
  const scorecards: Record<string, YahtzeeScorecard> = {
    ...state.scorecards,
    [playerId]: { scores: { ...card.scores, [category]: points } }
  }

  const finished = isTurnComplete(scorecards)
  if (finished) {
    return {
      ok: true,
      state: { ...state, scorecards, status: 'finished', ...freshTurn() }
    }
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.playerOrder.length
  const round = nextIndex === 0 ? state.round + 1 : state.round
  return {
    ok: true,
    state: {
      ...state,
      scorecards,
      currentPlayerIndex: nextIndex,
      round,
      ...freshTurn()
    }
  }
}

/**
 * Remove a player from an in-progress game (e.g. they disconnected).
 * Returns the adjusted state, or null if no players remain.
 * Because the server owns state, this keeps the game playable for the rest.
 */
export function removePlayerFromGame(
  state: YahtzeeGameState,
  playerId: string
): YahtzeeGameState | null {
  const idx = state.playerOrder.indexOf(playerId)
  if (idx === -1) return state

  const playerOrder = state.playerOrder.filter((id) => id !== playerId)
  if (playerOrder.length === 0) return null

  const scorecards = { ...state.scorecards }
  delete scorecards[playerId]

  const wasCurrent = idx === state.currentPlayerIndex
  let currentPlayerIndex = state.currentPlayerIndex
  if (idx < state.currentPlayerIndex) currentPlayerIndex--
  currentPlayerIndex = ((currentPlayerIndex % playerOrder.length) + playerOrder.length) % playerOrder.length

  let next: YahtzeeGameState = { ...state, playerOrder, scorecards, currentPlayerIndex }
  // If the departing player was mid-turn, start a clean turn for whoever is now up.
  if (wasCurrent) next = { ...next, ...freshTurn() }
  if (isTurnComplete(scorecards)) next.status = 'finished'
  return next
}

/** True once every player has filled all categories. */
export function isTurnComplete(scorecards: Record<string, YahtzeeScorecard>): boolean {
  return Object.values(scorecards).every(
    (card) => Object.keys(card.scores).length === CATEGORY_COUNT
  )
}

export interface FinalScore {
  playerId: string
  totals: ScoreTotals
  rank: number
}

/** Final standings, ranked highest total first (ties share a rank). */
export function calculateFinalScores(state: YahtzeeGameState): FinalScore[] {
  const scored = state.playerOrder.map((playerId) => ({
    playerId,
    totals: calculateTotals(state.scorecards[playerId]?.scores ?? {})
  }))
  scored.sort((a, b) => b.totals.grandTotal - a.totals.grandTotal)

  let lastScore = Number.NaN
  let lastRank = 0
  return scored.map((entry, i) => {
    if (entry.totals.grandTotal !== lastScore) {
      lastRank = i + 1
      lastScore = entry.totals.grandTotal
    }
    return { ...entry, rank: lastRank }
  })
}

export { ALL_CATEGORIES, CATEGORY_COUNT }
