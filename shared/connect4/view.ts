/**
 * Client-facing Connect 4 view and the state serializer.
 *
 * Connect 4 has no hidden information — the whole board is public — so the view
 * is essentially the authoritative state plus per-player convenience fields
 * (`yourTurn`, `yourColor`). {@link getPlayerView} is still the single choke
 * point the server uses, mirroring the other games.
 */
import type { Connect4Coord, Connect4Board, Connect4PlayerColor } from './types'
import type { Connect4GameState, Connect4LastMove } from './engine'

/** One player's public identity in the match (id + assigned colour). */
export interface Connect4PlayerInfo {
  id: string
  color: Connect4PlayerColor
}

export interface Connect4View {
  status: 'playing' | 'finished'
  selfId: string
  opponentId: string | null
  currentPlayerId: string
  yourTurn: boolean
  board: Connect4Board
  players: Connect4PlayerInfo[]
  /** The local player's colour (null if they are only a spectator/unknown). */
  yourColor: Connect4PlayerColor | null
  winnerId?: string
  winningCells?: Connect4Coord[]
  draw: boolean
  lastMove?: Connect4LastMove
}

export interface Connect4Results {
  winnerId?: string
  draw: boolean
}

export function getPlayerView(state: Connect4GameState, playerId: string): Connect4View {
  const opponentId = state.playerOrder.find((id) => id !== playerId) ?? null
  const players: Connect4PlayerInfo[] = state.playerOrder.map((id) => ({
    id,
    color: state.colors[id]
  }))
  return {
    status: state.status,
    selfId: playerId,
    opponentId,
    currentPlayerId: state.playerOrder[state.currentPlayerIndex],
    yourTurn:
      state.status === 'playing' && state.playerOrder[state.currentPlayerIndex] === playerId,
    board: state.board,
    players,
    yourColor: state.colors[playerId] ?? null,
    winnerId: state.winnerId,
    winningCells: state.winningCells,
    draw: state.draw,
    lastMove: state.lastMove
  }
}

export function getResults(state: Connect4GameState): Connect4Results {
  return { winnerId: state.winnerId, draw: state.draw }
}
