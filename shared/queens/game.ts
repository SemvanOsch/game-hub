/**
 * Queens Battle Royale {@link GameEngine} implementation: the adapter that plugs
 * the pure match rules into the game-agnostic multiplayer core. All official
 * timing flows through the server clock (`Date.now()`) injected here, so clients
 * can neither fake completion times nor advance the match on their own.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  advanceRound,
  createMatch,
  getWinnerIds,
  isMatchFinished,
  nextTimeout,
  removePlayerFromMatch,
  submitSolution,
  tickMatch,
  type QueensMatchState
} from './engine'
import { getPlayerView, getResults, type QueensResults, type QueensView } from './view'

/** Submit a completed queen placement for a specific round. */
export interface SubmitSolutionAction {
  type: 'submit_solution'
  round: number
  queens: number[]
}
/** Host-only: continue from the round results to the next round (or final results). */
export interface AdvanceAction {
  type: 'advance'
}

export type QueensAction = SubmitSolutionAction | AdvanceAction

/** Narrow an untrusted queens payload to a clean array of non-negative integers. */
function parseQueens(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  // Guard against absurd payloads before the reducer/validator sees them.
  if (raw.length === 0 || raw.length > 64) return null
  const out: number[] = []
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null
    out.push(v)
  }
  return out
}

export const queensEngine: GameEngine<
  QueensMatchState,
  QueensView,
  QueensAction,
  QueensResults
> = {
  id: 'queens',
  minPlayers: 2,
  maxPlayers: 6,

  createGame(playerOrder: string[], options?: unknown): QueensMatchState {
    return createMatch(playerOrder, options, Date.now(), Math.random)
  },

  validateAction(raw: unknown): QueensAction | null {
    if (!raw || typeof raw !== 'object') return null
    const action = raw as Record<string, unknown>
    if (action.type === 'advance') return { type: 'advance' }
    if (action.type === 'submit_solution') {
      const { round } = action
      if (typeof round !== 'number' || !Number.isInteger(round) || round < 0) return null
      const queens = parseQueens(action.queens)
      if (!queens) return null
      return { type: 'submit_solution', round, queens }
    }
    return null
  },

  applyAction(
    state: QueensMatchState,
    playerId: string,
    action: QueensAction
  ): EngineActionResult<QueensMatchState> {
    switch (action.type) {
      case 'submit_solution':
        return submitSolution(state, playerId, action.round, action.queens, Date.now())
      case 'advance':
        return advanceRound(state, playerId, Date.now())
      default:
        return { ok: false, code: 'INVALID_ACTION', message: 'Unknown action.' }
    }
  },

  removePlayer: removePlayerFromMatch,
  getPlayerView,
  isFinished: isMatchFinished,
  getResults,
  getWinnerIds,
  nextTimeout,
  tick: tickMatch
}
