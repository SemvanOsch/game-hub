/**
 * Skip-Bo {@link GameEngine} implementation: the adapter that plugs the pure
 * Skip-Bo rules into the game-agnostic multiplayer core. Client input is
 * untrusted and narrowed here before ever reaching a reducer. All official timing
 * flows through the server clock (`Date.now()`) injected here, so clients cannot
 * influence the turn timer.
 */
import type { EngineActionResult, GameEngine } from '../games/types'
import {
  createGame,
  discard,
  nextTimeout,
  playCard,
  removePlayerFromGame,
  tickMatch,
  type PlaySource,
  type SkipBoGameState
} from './engine'
import { getPlayerView, getResults, type SkipBoResults, type SkipBoView } from './view'

export interface PlayAction {
  type: 'play'
  from: PlaySource
  buildingIndex: number
}
export interface DiscardAction {
  type: 'discard'
  cardId: string
  discardIndex: number
}

export type SkipBoAction = PlayAction | DiscardAction

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

/** Narrow an untrusted play source. Returns null if malformed. */
function parseSource(raw: unknown): PlaySource | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  switch (s.source) {
    case 'stock':
      return { source: 'stock' }
    case 'hand':
      return typeof s.cardId === 'string' && s.cardId.length > 0
        ? { source: 'hand', cardId: s.cardId }
        : null
    case 'discard':
      return isInt(s.discardIndex) ? { source: 'discard', discardIndex: s.discardIndex } : null
    default:
      return null
  }
}

export const skipBoEngine: GameEngine<SkipBoGameState, SkipBoView, SkipBoAction, SkipBoResults> = {
  id: 'skipbo',
  minPlayers: 2,
  maxPlayers: 6,

  createGame: (playerOrder, options) => createGame(playerOrder, options, Date.now(), Math.random),

  validateAction(raw: unknown): SkipBoAction | null {
    if (!raw || typeof raw !== 'object') return null
    const a = raw as Record<string, unknown>
    switch (a.type) {
      case 'play': {
        const from = parseSource(a.from)
        if (!from) return null
        if (!isInt(a.buildingIndex)) return null
        return { type: 'play', from, buildingIndex: a.buildingIndex }
      }
      case 'discard': {
        if (typeof a.cardId !== 'string' || a.cardId.length === 0) return null
        if (!isInt(a.discardIndex)) return null
        return { type: 'discard', cardId: a.cardId, discardIndex: a.discardIndex }
      }
      default:
        return null
    }
  },

  applyAction(
    state: SkipBoGameState,
    playerId: string,
    action: SkipBoAction
  ): EngineActionResult<SkipBoGameState> {
    switch (action.type) {
      case 'play':
        return playCard(state, playerId, action.from, action.buildingIndex, Math.random)
      case 'discard':
        return discard(state, playerId, action.cardId, action.discardIndex, Date.now(), Math.random)
      default:
        return { ok: false, code: 'INVALID_ACTION', message: 'Unknown action.' }
    }
  },

  removePlayer: (state, playerId) => removePlayerFromGame(state, playerId, Date.now(), Math.random),
  getPlayerView,
  isFinished: (state) => state.status === 'finished',
  nextTimeout,
  tick: (state, now) => tickMatch(state, now, Math.random),
  getResults,
  getWinnerIds: (state) => (state.winnerId ? [state.winnerId] : [])
}
