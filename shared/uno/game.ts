/**
 * UNO {@link GameEngine} implementation: the adapter that plugs the pure UNO
 * rules into the game-agnostic multiplayer core. Client input is untrusted and
 * narrowed here before ever reaching a reducer.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import { UNO_COLORS, type UnoColor } from './cards'
import {
  callUno,
  catchUno,
  chooseColor,
  createGame,
  drawCard,
  pass,
  playCard,
  removePlayerFromGame,
  type UnoGameState
} from './engine'
import { getPlayerView, getResults, type UnoResults, type UnoView } from './view'

export interface PlayCardAction {
  type: 'play_card'
  cardId: string
  /** Optional colour for a wild, applied atomically when present. */
  chosenColor?: UnoColor
  /** Declare UNO with this play (when it leaves you on one card). */
  declareUno?: boolean
}
export interface ChooseColorAction {
  type: 'choose_color'
  color: UnoColor
}
export interface DrawCardAction {
  type: 'draw_card'
}
export interface PassAction {
  type: 'pass'
}
export interface CallUnoAction {
  type: 'call_uno'
}
export interface CatchUnoAction {
  type: 'catch_uno'
  targetId: string
}

export type UnoAction =
  | PlayCardAction
  | ChooseColorAction
  | DrawCardAction
  | PassAction
  | CallUnoAction
  | CatchUnoAction

function isColor(value: unknown): value is UnoColor {
  return typeof value === 'string' && (UNO_COLORS as readonly string[]).includes(value)
}

export const unoEngine: GameEngine<UnoGameState, UnoView, UnoAction, UnoResults> = {
  id: 'uno',
  minPlayers: 2,
  maxPlayers: 8,

  createGame,

  validateAction(raw: unknown): UnoAction | null {
    if (!raw || typeof raw !== 'object') return null
    const a = raw as Record<string, unknown>
    switch (a.type) {
      case 'play_card': {
        if (typeof a.cardId !== 'string' || a.cardId.length === 0) return null
        const action: PlayCardAction = { type: 'play_card', cardId: a.cardId }
        if (a.chosenColor !== undefined) {
          if (!isColor(a.chosenColor)) return null
          action.chosenColor = a.chosenColor
        }
        if (a.declareUno !== undefined) {
          if (typeof a.declareUno !== 'boolean') return null
          action.declareUno = a.declareUno
        }
        return action
      }
      case 'choose_color':
        return isColor(a.color) ? { type: 'choose_color', color: a.color } : null
      case 'draw_card':
        return { type: 'draw_card' }
      case 'pass':
        return { type: 'pass' }
      case 'call_uno':
        return { type: 'call_uno' }
      case 'catch_uno':
        return typeof a.targetId === 'string' && a.targetId.length > 0
          ? { type: 'catch_uno', targetId: a.targetId }
          : null
      default:
        return null
    }
  },

  applyAction(
    state: UnoGameState,
    playerId: string,
    action: UnoAction
  ): EngineActionResult<UnoGameState> {
    switch (action.type) {
      case 'play_card':
        return playCard(state, playerId, action.cardId, action.chosenColor, action.declareUno === true)
      case 'choose_color':
        return chooseColor(state, playerId, action.color)
      case 'draw_card':
        return drawCard(state, playerId)
      case 'pass':
        return pass(state, playerId)
      case 'call_uno':
        return callUno(state, playerId)
      case 'catch_uno':
        return catchUno(state, playerId, action.targetId)
      default:
        return { ok: false, code: 'INVALID_ACTION', message: 'Unknown action.' }
    }
  },

  removePlayer: removePlayerFromGame,
  getPlayerView,
  isFinished: (state) => state.status === 'finished',
  getResults,
  getWinnerIds: (state) => (state.winnerId ? [state.winnerId] : [])
}
