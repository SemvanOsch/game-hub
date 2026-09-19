import { create } from 'zustand'
import type { RoomState } from '@shared/types'
import type { ServerErrorCode, ServerMessage } from '@shared/protocol'
import type { Category } from '@shared/yahtzee/categories'
import type { FinalScore, YahtzeeGameState } from '@shared/yahtzee/engine'
import { MULTIPLAYER_SERVER_URL } from '../config'
import { Connection } from '../net/connection'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface MultiplayerState {
  connectionStatus: ConnectionStatus
  selfId: string | null
  room: RoomState | null
  game: YahtzeeGameState | null
  results: FinalScore[] | null
  /** Last user-facing error, if any. */
  error: string | null

  host: (playerName: string, gameId: string) => Promise<void>
  join: (code: string, playerName: string) => Promise<void>
  leave: () => void
  startGame: () => void
  rollDice: () => void
  keepDie: (index: number) => void
  submitScore: (category: Category) => void
  returnToLobby: () => void
  clearError: () => void
}

// The socket lives outside React state so it never triggers re-renders.
let connection: Connection | null = null

const ERROR_TEXT: Record<ServerErrorCode, string> = {
  ROOM_NOT_FOUND: 'No room found with that code. Double-check it and try again.',
  ROOM_FULL: 'That room is already full.',
  INVALID_CODE: 'Please enter a valid room code.',
  NOT_HOST: 'Only the host can do that.',
  GAME_ALREADY_STARTED: 'That game has already started.',
  NOT_ENOUGH_PLAYERS: 'You need at least 2 players to start.',
  NOT_IN_ROOM: 'You are not in a room anymore.',
  INVALID_ACTION: 'That move is not allowed right now.',
  NOT_YOUR_TURN: "It is not your turn.",
  GAME_OVER: 'The game has already finished.',
  MALFORMED: 'Something went wrong communicating with the server.',
  NAME_REQUIRED: 'A display name is required.',
  INTERNAL: 'The server ran into a problem. Please try again.'
}

export const useMultiplayerStore = create<MultiplayerState>((set, get) => {
  function handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'joined':
        set({ selfId: message.selfId, room: message.room, error: null })
        break
      case 'room_update':
        set((state) => ({
          room: message.room,
          // Returning to the lobby clears any finished game.
          game: message.room.status === 'lobby' ? null : state.game,
          results: message.room.status === 'lobby' ? null : state.results
        }))
        break
      case 'game_state':
        set({ room: message.room, game: message.game, results: null })
        break
      case 'game_over':
        set({ room: message.room, game: message.game, results: message.results })
        break
      case 'error':
        set({ error: ERROR_TEXT[message.code] ?? message.message })
        break
    }
  }

  function ensureConnection(): Promise<void> {
    if (connection && connection.isOpen) return Promise.resolve()
    set({ connectionStatus: 'connecting', error: null })
    connection = new Connection(MULTIPLAYER_SERVER_URL, {
      onMessage: handleMessage,
      onClose: () => {
        set({
          connectionStatus: 'error',
          error: 'Connection to the server was lost.',
          room: null,
          game: null,
          results: null,
          selfId: null
        })
        connection = null
      },
      onError: () => {
        /* handled via connect() rejection / onClose */
      }
    })
    return connection.connect().then(
      () => set({ connectionStatus: 'connected' }),
      (err: Error) => {
        set({ connectionStatus: 'error', error: err.message })
        connection = null
        throw err
      }
    )
  }

  return {
    connectionStatus: 'idle',
    selfId: null,
    room: null,
    game: null,
    results: null,
    error: null,

    async host(playerName, gameId) {
      await ensureConnection()
      connection?.send({ type: 'create_room', playerName, gameId })
    },

    async join(code, playerName) {
      await ensureConnection()
      connection?.send({ type: 'join_room', code, playerName })
    },

    leave() {
      connection?.send({ type: 'leave_room' })
      connection?.close()
      connection = null
      set({
        connectionStatus: 'idle',
        selfId: null,
        room: null,
        game: null,
        results: null,
        error: null
      })
    },

    startGame() {
      connection?.send({ type: 'start_game' })
    },
    rollDice() {
      connection?.send({ type: 'roll_dice' })
    },
    keepDie(index) {
      connection?.send({ type: 'keep_die', index })
    },
    submitScore(category) {
      connection?.send({ type: 'submit_score', category })
    },
    returnToLobby() {
      connection?.send({ type: 'return_to_lobby' })
    },

    clearError() {
      if (get().error) set({ error: null })
    }
  }
})

/** Convenience selector: is the local player the room host? */
export function selectIsHost(state: MultiplayerState): boolean {
  return Boolean(state.room && state.selfId && state.room.hostId === state.selfId)
}

/** Convenience selector: is it the local player's turn in the active game? */
export function selectIsMyTurn(state: MultiplayerState): boolean {
  if (!state.game || !state.selfId || state.game.status !== 'playing') return false
  return state.game.playerOrder[state.game.currentPlayerIndex] === state.selfId
}
