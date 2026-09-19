import { create } from 'zustand'
import type { RoomState } from '@shared/types'
import type { ServerErrorCode, ServerMessage } from '@shared/protocol'
import { ensureConnection, onDisconnect, onServerMessage, sendMessage } from '../net/socket'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface MultiplayerState {
  connectionStatus: ConnectionStatus
  selfId: string | null
  room: RoomState | null
  /** Id of the game currently in progress (matches a registry game id). */
  gameId: string | null
  /** The per-player, game-specific client view. Shape depends on `gameId`. */
  view: unknown | null
  /** Game-specific final results payload, present once the game is over. */
  results: unknown | null
  /** Last user-facing error, if any. */
  error: string | null

  host: (playerName: string, gameId: string) => Promise<void>
  join: (code: string, playerName: string) => Promise<void>
  leave: () => void
  startGame: () => void
  /** Send a game-specific action to the authoritative server. */
  sendAction: (action: unknown) => void
  returnToLobby: () => void
  clearError: () => void
}

const ERROR_TEXT: Record<ServerErrorCode, string> = {
  ROOM_NOT_FOUND: 'No room found with that code. Double-check it and try again.',
  ROOM_FULL: 'That room is already full.',
  INVALID_CODE: 'Please enter a valid room code.',
  NOT_HOST: 'Only the host can do that.',
  GAME_ALREADY_STARTED: 'That game has already started.',
  NOT_ENOUGH_PLAYERS: 'You do not have enough players to start.',
  NOT_IN_ROOM: 'You are not in a room anymore.',
  INVALID_ACTION: 'That move is not allowed right now.',
  NOT_YOUR_TURN: 'It is not your turn.',
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
          gameId: message.room.status === 'lobby' ? null : state.gameId,
          view: message.room.status === 'lobby' ? null : state.view,
          results: message.room.status === 'lobby' ? null : state.results
        }))
        break
      case 'game_state':
        set({ room: message.room, gameId: message.gameId, view: message.view, results: null })
        break
      case 'game_over':
        set({
          room: message.room,
          gameId: message.gameId,
          view: message.view,
          results: message.results
        })
        break
      case 'error':
        set({ error: ERROR_TEXT[message.code] ?? message.message })
        break
      // Account/friend messages are handled by the auth store.
    }
  }

  // Subscribe once to the shared socket. Room state resets on disconnect, but
  // the socket itself (and the auth session on it) is managed by socket.ts.
  onServerMessage(handleMessage)
  onDisconnect(() => {
    set({
      connectionStatus: 'error',
      error: 'Connection to the server was lost.',
      room: null,
      gameId: null,
      view: null,
      results: null,
      selfId: null
    })
  })

  async function connect(): Promise<void> {
    set({ connectionStatus: 'connecting', error: null })
    try {
      await ensureConnection()
      set({ connectionStatus: 'connected' })
    } catch (err) {
      set({ connectionStatus: 'error', error: (err as Error).message })
      throw err
    }
  }

  return {
    connectionStatus: 'idle',
    selfId: null,
    room: null,
    gameId: null,
    view: null,
    results: null,
    error: null,

    async host(playerName, gameId) {
      await connect()
      sendMessage({ type: 'create_room', playerName, gameId })
    },

    async join(code, playerName) {
      await connect()
      sendMessage({ type: 'join_room', code, playerName })
    },

    leave() {
      // Leave the room but keep the shared socket open (auth/friends live on it).
      sendMessage({ type: 'leave_room' })
      set({
        selfId: null,
        room: null,
        gameId: null,
        view: null,
        results: null,
        error: null
      })
    },

    startGame() {
      sendMessage({ type: 'start_game' })
    },
    sendAction(action) {
      sendMessage({ type: 'game_action', action })
    },
    returnToLobby() {
      sendMessage({ type: 'return_to_lobby' })
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
