/**
 * Yahtzee {@link GameEngine} implementation: adapts the existing pure Yahtzee
 * rules to the game-agnostic multiplayer core.
 *
 * Yahtzee has no hidden information, so the per-player view is simply the full
 * authoritative state.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import { isCategory, type Category } from './categories'
import {
  calculateFinalScores,
  createGame,
  keepDieAction,
  removePlayerFromGame,
  rollDiceAction,
  submitScoreAction,
  type FinalScore,
  type YahtzeeGameState
} from './engine'

export type YahtzeeAction =
  | { kind: 'roll' }
  | { kind: 'keep'; index: number }
  | { kind: 'score'; category: Category }

export const yahtzeeEngine: GameEngine<
  YahtzeeGameState,
  YahtzeeGameState,
  YahtzeeAction,
  FinalScore[]
> = {
  id: 'yahtzee',
  minPlayers: 2,
  maxPlayers: 6,

  createGame,

  validateAction(raw: unknown): YahtzeeAction | null {
    if (!raw || typeof raw !== 'object') return null
    const action = raw as Record<string, unknown>
    switch (action.kind) {
      case 'roll':
        return { kind: 'roll' }
      case 'keep':
        return Number.isInteger(action.index) ? { kind: 'keep', index: action.index as number } : null
      case 'score':
        return isCategory(action.category) ? { kind: 'score', category: action.category } : null
      default:
        return null
    }
  },

  applyAction(
    state: YahtzeeGameState,
    playerId: string,
    action: YahtzeeAction
  ): EngineActionResult<YahtzeeGameState> {
    switch (action.kind) {
      case 'roll':
        return rollDiceAction(state, playerId)
      case 'keep':
        return keepDieAction(state, playerId, action.index)
      case 'score':
        return submitScoreAction(state, playerId, action.category)
    }
  },

  removePlayer: removePlayerFromGame,
  // No hidden information: every player sees the full state.
  getPlayerView: (state) => state,
  isFinished: (state) => state.status === 'finished',
  getResults: (state) => calculateFinalScores(state),
  getWinnerIds: (state) => {
    // Rank 1 in the final standings; more than one id on a tie.
    const finalScores = calculateFinalScores(state)
    return finalScores.filter((entry) => entry.rank === 1).map((entry) => entry.playerId)
  }
}
