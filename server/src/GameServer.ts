import { randomUUID } from 'node:crypto'
import type { WebSocket } from 'ws'
import {
  encode,
  safeParse,
  type ClientMessage,
  type ServerErrorCode,
  type ServerMessage
} from '@shared/protocol'
import { isCategory } from '@shared/yahtzee/categories'
import { calculateFinalScores } from '@shared/yahtzee/engine'
import { Room } from './Room'
import { generateUniqueRoomCode, normalizeCode } from './roomCode'

interface ClientState {
  socket: WebSocket
  playerId: string | null
  roomCode: string | null
}

const MAX_NAME_LENGTH = 24

/**
 * Owns all rooms and routes client messages to the authoritative game logic.
 * One instance per process; `handleConnection` is called per socket.
 */
export class GameServer {
  private rooms = new Map<string, Room>()
  private clients = new Map<WebSocket, ClientState>()

  handleConnection(socket: WebSocket): void {
    this.clients.set(socket, { socket, playerId: null, roomCode: null })

    socket.on('message', (data) => {
      this.handleMessage(socket, data.toString())
    })
    socket.on('close', () => this.handleClose(socket))
    socket.on('error', () => this.handleClose(socket))
  }

  private sendError(socket: WebSocket, code: ServerErrorCode, message: string): void {
    if (socket.readyState === socket.OPEN) {
      const payload: ServerMessage = { type: 'error', code, message }
      socket.send(encode(payload))
    }
  }

  private getRoom(client: ClientState): Room | undefined {
    if (!client.roomCode) return undefined
    return this.rooms.get(client.roomCode)
  }

  private handleMessage(socket: WebSocket, raw: string): void {
    const client = this.clients.get(socket)
    if (!client) return

    const parsed = safeParse(raw) as ClientMessage | null
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      this.sendError(socket, 'MALFORMED', 'Message could not be parsed.')
      return
    }

    try {
      this.dispatch(client, parsed)
    } catch (err) {
      console.error('Error handling message', parsed.type, err)
      this.sendError(socket, 'INTERNAL', 'The server hit an unexpected error.')
    }
  }

  private dispatch(client: ClientState, msg: ClientMessage): void {
    switch (msg.type) {
      case 'create_room':
        return this.onCreateRoom(client, msg.playerName, msg.gameId)
      case 'join_room':
        return this.onJoinRoom(client, msg.code, msg.playerName)
      case 'leave_room':
        return this.onLeaveRoom(client)
      case 'start_game':
        return this.onStartGame(client)
      case 'roll_dice':
        return this.onGameAction(client, { kind: 'roll' })
      case 'keep_die':
        if (typeof msg.index !== 'number') {
          return this.sendError(client.socket, 'INVALID_ACTION', 'A die index is required.')
        }
        return this.onGameAction(client, { kind: 'keep', index: msg.index })
      case 'submit_score':
        if (!isCategory(msg.category)) {
          return this.sendError(client.socket, 'INVALID_ACTION', 'Unknown scoring category.')
        }
        return this.onGameAction(client, { kind: 'score', category: msg.category })
      case 'return_to_lobby':
        return this.onReturnToLobby(client)
      default:
        return this.sendError(client.socket, 'MALFORMED', 'Unknown message type.')
    }
  }

  private validateName(socket: WebSocket, name: unknown): string | null {
    if (typeof name !== 'string' || name.trim().length === 0) {
      this.sendError(socket, 'NAME_REQUIRED', 'A display name is required.')
      return null
    }
    return name.trim().slice(0, MAX_NAME_LENGTH)
  }

  private onCreateRoom(client: ClientState, playerName: unknown, gameId: unknown): void {
    const name = this.validateName(client.socket, playerName)
    if (!name) return

    // Leave any existing room first.
    if (client.roomCode) this.onLeaveRoom(client)

    const code = generateUniqueRoomCode(new Set(this.rooms.keys()))
    const room = new Room(code, typeof gameId === 'string' && gameId ? gameId : 'yahtzee')
    this.rooms.set(code, room)

    const playerId = randomUUID()
    room.addPlayer(playerId, name, client.socket)
    client.playerId = playerId
    client.roomCode = code

    room.send(playerId, { type: 'joined', selfId: playerId, room: room.toRoomState() })
  }

  private onJoinRoom(client: ClientState, code: unknown, playerName: unknown): void {
    const name = this.validateName(client.socket, playerName)
    if (!name) return
    if (typeof code !== 'string' || code.trim().length === 0) {
      return this.sendError(client.socket, 'INVALID_CODE', 'Enter a room code to join.')
    }

    const room = this.rooms.get(normalizeCode(code))
    if (!room) {
      return this.sendError(client.socket, 'ROOM_NOT_FOUND', 'No room found with that code.')
    }
    if (room.status !== 'lobby') {
      return this.sendError(
        client.socket,
        'GAME_ALREADY_STARTED',
        'That game has already started.'
      )
    }
    if (room.isFull()) {
      return this.sendError(client.socket, 'ROOM_FULL', 'That room is already full.')
    }

    if (client.roomCode) this.onLeaveRoom(client)

    const playerId = randomUUID()
    room.addPlayer(playerId, name, client.socket)
    client.playerId = playerId
    client.roomCode = room.code

    room.send(playerId, { type: 'joined', selfId: playerId, room: room.toRoomState() })
    // Tell everyone (incl. the newcomer) about the updated roster.
    room.broadcast({ type: 'room_update', room: room.toRoomState() })
  }

  private onLeaveRoom(client: ClientState): void {
    const room = this.getRoom(client)
    const playerId = client.playerId
    client.roomCode = null
    client.playerId = null
    if (!room || !playerId) return

    room.handleDisconnect(playerId)
    this.broadcastState(room)
  }

  private onStartGame(client: ClientState): void {
    const room = this.getRoom(client)
    if (!room || !client.playerId) {
      return this.sendError(client.socket, 'NOT_IN_ROOM', 'You are not in a room.')
    }
    if (client.playerId !== room.hostId) {
      return this.sendError(client.socket, 'NOT_HOST', 'Only the host can start the game.')
    }
    if (room.status !== 'lobby') {
      return this.sendError(
        client.socket,
        'GAME_ALREADY_STARTED',
        'The game has already started.'
      )
    }
    if (!room.canStart()) {
      return this.sendError(
        client.socket,
        'NOT_ENOUGH_PLAYERS',
        'At least 2 players are required to start.'
      )
    }
    room.startGame()
    this.broadcastState(room)
  }

  private onGameAction(
    client: ClientState,
    action: Parameters<Room['applyAction']>[1]
  ): void {
    const room = this.getRoom(client)
    if (!room || !client.playerId) {
      return this.sendError(client.socket, 'NOT_IN_ROOM', 'You are not in a room.')
    }
    const result = room.applyAction(client.playerId, action)
    if (!result.ok) {
      const code: ServerErrorCode = result.code === 'NOT_YOUR_TURN' ? 'NOT_YOUR_TURN' : 'INVALID_ACTION'
      return this.sendError(client.socket, code, result.message)
    }
    this.broadcastState(room)
  }

  private onReturnToLobby(client: ClientState): void {
    const room = this.getRoom(client)
    if (!room || !client.playerId) {
      return this.sendError(client.socket, 'NOT_IN_ROOM', 'You are not in a room.')
    }
    if (client.playerId !== room.hostId) {
      return this.sendError(client.socket, 'NOT_HOST', 'Only the host can return to the lobby.')
    }
    room.returnToLobby()
    this.broadcastState(room)
  }

  /** Broadcast the appropriate authoritative state for a room's current phase. */
  private broadcastState(room: Room): void {
    if (room.isEmpty) {
      this.rooms.delete(room.code)
      return
    }
    const roomState = room.toRoomState()
    const game = room.getGame()
    if (game && room.status !== 'lobby') {
      if (room.status === 'finished') {
        room.broadcast({
          type: 'game_over',
          room: roomState,
          game,
          results: calculateFinalScores(game)
        })
      } else {
        room.broadcast({ type: 'game_state', room: roomState, game })
      }
    } else {
      room.broadcast({ type: 'room_update', room: roomState })
    }
  }

  private handleClose(socket: WebSocket): void {
    const client = this.clients.get(socket)
    this.clients.delete(socket)
    if (!client) return
    const room = this.getRoom(client)
    if (room && client.playerId) {
      room.handleDisconnect(client.playerId)
      this.broadcastState(room)
    }
  }
}
