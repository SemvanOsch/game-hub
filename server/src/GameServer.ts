import { randomUUID } from 'node:crypto'
import type { WebSocket } from 'ws'
import {
  encode,
  safeParse,
  type ClientMessage,
  type ServerErrorCode,
  type ServerMessage
} from '@shared/protocol'
import { DEFAULT_GAME_ID, isKnownGame } from '@shared/games/registry'
import { Room } from './Room'
import { generateUniqueRoomCode, normalizeCode } from './roomCode'
import { createDb, resolveDbPath, type DB } from './db'
import { authenticate, createUser, getUserById, SessionStore, type AuthResult } from './auth'
import {
  areFriends,
  getFriendsPayload,
  getRelatedUserIds,
  recordMatch,
  removeFriend,
  respondToRequest,
  sendFriendRequest
} from './friends'

interface ClientState {
  socket: WebSocket
  playerId: string | null
  roomCode: string | null
  /** Account id once authenticated; null for guests. */
  userId: string | null
  /** Session token issued at login, so the client can resume after a reconnect. */
  token: string | null
}

const MAX_NAME_LENGTH = 24

/**
 * Owns all rooms and routes client messages to the authoritative game logic.
 * One instance per process; `handleConnection` is called per socket.
 */
export class GameServer {
  private rooms = new Map<string, Room>()
  private clients = new Map<WebSocket, ClientState>()
  private readonly db: DB
  private readonly sessions = new SessionStore()
  /** userId -> the set of that account's live sockets (multi-window safe). */
  private presence = new Map<string, Set<WebSocket>>()

  constructor(db: DB = createDb(resolveDbPath())) {
    this.db = db
  }

  handleConnection(socket: WebSocket): void {
    this.clients.set(socket, { socket, playerId: null, roomCode: null, userId: null, token: null })

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
        return this.onStartGame(client, msg.options)
      case 'game_action':
        return this.onGameAction(client, msg.action)
      case 'return_to_lobby':
        return this.onReturnToLobby(client)
      case 'signup':
        return this.onAuth(client, createUser(this.db, msg.username ?? '', msg.password ?? ''))
      case 'login':
        return this.onAuth(client, authenticate(this.db, msg.username ?? '', msg.password ?? ''))
      case 'resume_session':
        return this.onResumeSession(client, msg.token)
      case 'logout':
        return this.onLogout(client)
      case 'friend_request':
        return this.onFriendRequest(client, msg.username)
      case 'respond_friend_request':
        return this.onRespondFriendRequest(client, msg.fromUserId, msg.accept)
      case 'remove_friend':
        return this.onRemoveFriend(client, msg.userId)
      case 'invite_to_room':
        return this.onInviteToRoom(client, msg.toUserId)
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

    const requestedGame = typeof gameId === 'string' && isKnownGame(gameId) ? gameId : DEFAULT_GAME_ID
    const code = generateUniqueRoomCode(new Set(this.rooms.keys()))
    const room = new Room(code, requestedGame)
    this.rooms.set(code, room)

    const playerId = randomUUID()
    room.addPlayer(playerId, name, client.socket, client.userId)
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
    room.addPlayer(playerId, name, client.socket, client.userId)
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
    this.removeFromRoom(room, playerId)
  }

  /**
   * Remove a player from a room and broadcast the fallout. A player leaving an
   * already-finished game does NOT re-broadcast: the remaining players keep the
   * final game-over intact. A mid-game exit still broadcasts (e.g. so a 1v1
   * opponent sees their forfeit win).
   */
  private removeFromRoom(room: Room, playerId: string): void {
    const wasFinished = room.status === 'finished'
    room.handleDisconnect(playerId)
    if (room.isEmpty) {
      this.rooms.delete(room.code)
    } else if (!wasFinished) {
      this.broadcastState(room)
    }
  }

  private onStartGame(client: ClientState, options?: unknown): void {
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
        `${room.minPlayers} players are required to start.`
      )
    }
    room.startGame(options)
    this.broadcastState(room)
  }

  private onGameAction(client: ClientState, rawAction: unknown): void {
    const room = this.getRoom(client)
    if (!room || !client.playerId) {
      return this.sendError(client.socket, 'NOT_IN_ROOM', 'You are not in a room.')
    }
    const action = room.validateAction(rawAction)
    if (action === null) {
      return this.sendError(client.socket, 'INVALID_ACTION', 'That move is not allowed.')
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

  /**
   * Broadcast the appropriate state for a room's current phase. During a game,
   * each player receives their OWN sanitized view — hidden information is never
   * sent to a client that is not allowed to see it.
   */
  private broadcastState(room: Room): void {
    if (room.isEmpty) {
      this.rooms.delete(room.code)
      return
    }
    const roomState = room.toRoomState()
    if (room.hasGame() && room.status !== 'lobby') {
      const finished = room.status === 'finished'
      const results = finished ? room.getResults() : null
      if (finished) this.recordFinishedMatch(room)
      for (const playerId of room.playerIds) {
        const view = room.getPlayerView(playerId)
        if (finished) {
          room.send(playerId, {
            type: 'game_over',
            room: roomState,
            gameId: room.gameId,
            view,
            results
          })
        } else {
          room.send(playerId, { type: 'game_state', room: roomState, gameId: room.gameId, view })
        }
      }
    } else {
      room.broadcast({ type: 'room_update', room: roomState })
    }
  }

  /**
   * Record a finished game exactly once. Only games where every participant is
   * a logged-in account are recorded (guest/mixed rooms are skipped), then the
   * affected players' friend views are refreshed so records update live.
   */
  private recordFinishedMatch(room: Room): void {
    if (room.hasRecordedMatch) return
    room.markMatchRecorded()
    const outcome = room.getMatchOutcome()
    if (!outcome.recordable) return
    recordMatch(this.db, room.gameId, outcome.participantIds, outcome.winnerIds)
    for (const userId of outcome.participantIds) this.broadcastPresenceChange(userId)
  }

  // --- Accounts & friends --------------------------------------------------

  private onAuth(client: ClientState, result: AuthResult): void {
    if (!result.ok) {
      return this.send(client.socket, { type: 'auth_result', ok: false, error: result.error })
    }
    this.setIdentity(client, result.user.id)
    const token = this.sessions.issue(result.user.id)
    client.token = token
    this.send(client.socket, {
      type: 'auth_result',
      ok: true,
      token,
      profile: result.user
    })
    this.pushFriends(client.userId!)
    this.broadcastPresenceChange(result.user.id)
  }

  private onResumeSession(client: ClientState, token: unknown): void {
    if (typeof token !== 'string') {
      return this.send(client.socket, { type: 'auth_result', ok: false, error: 'Invalid session.' })
    }
    const userId = this.sessions.resolve(token)
    const user = userId ? getUserById(this.db, userId) : null
    if (!user) {
      return this.send(client.socket, {
        type: 'auth_result',
        ok: false,
        error: 'Your session has expired. Please log in again.'
      })
    }
    this.setIdentity(client, user.id)
    client.token = token
    this.send(client.socket, { type: 'auth_result', ok: true, token, profile: user })
    this.pushFriends(user.id)
    this.broadcastPresenceChange(user.id)
  }

  private onLogout(client: ClientState): void {
    const userId = client.userId
    if (client.token) this.sessions.revoke(client.token)
    this.removePresence(client)
    client.userId = null
    client.token = null
    this.send(client.socket, { type: 'auth_result', ok: true })
    if (userId) this.broadcastPresenceChange(userId)
  }

  private onFriendRequest(client: ClientState, username: unknown): void {
    if (!client.userId) return this.sendFriendError(client, 'Log in to add friends.')
    if (typeof username !== 'string' || !username.trim()) {
      return this.sendFriendError(client, 'Enter a username.')
    }
    const result = sendFriendRequest(this.db, client.userId, username)
    if (!result.ok) return this.sendFriendError(client, result.error)
    // Refresh both sides: the sender (outgoing) and, if online, the target.
    this.broadcastPresenceChange(client.userId)
  }

  private onRespondFriendRequest(
    client: ClientState,
    fromUserId: unknown,
    accept: unknown
  ): void {
    if (!client.userId) return this.sendFriendError(client, 'Log in to manage friends.')
    if (typeof fromUserId !== 'string') return this.sendFriendError(client, 'Invalid request.')
    const result = respondToRequest(this.db, client.userId, fromUserId, accept === true)
    if (!result.ok) return this.sendFriendError(client, result.error)
    this.broadcastPresenceChange(client.userId)
    this.pushFriends(fromUserId)
  }

  private onRemoveFriend(client: ClientState, userId: unknown): void {
    if (!client.userId) return this.sendFriendError(client, 'Log in to manage friends.')
    if (typeof userId !== 'string') return this.sendFriendError(client, 'Invalid request.')
    removeFriend(this.db, client.userId, userId)
    this.broadcastPresenceChange(client.userId)
    this.pushFriends(userId)
  }

  private sendFriendError(client: ClientState, message: string): void {
    this.send(client.socket, { type: 'friend_error', message })
  }

  /**
   * Invite a friend into the sender's current lobby. The invitee accepts by
   * sending a normal `join_room` with the delivered code, so no separate join
   * path is needed. Only friends who are online can be invited.
   */
  private onInviteToRoom(client: ClientState, toUserId: unknown): void {
    if (!client.userId) return this.sendFriendError(client, 'Log in to invite friends.')
    if (typeof toUserId !== 'string') return
    const room = this.getRoom(client)
    if (!room) return this.sendFriendError(client, 'You are not in a room.')
    if (room.status !== 'lobby') {
      return this.sendFriendError(client, 'You can only invite while in the lobby.')
    }
    if (room.isFull()) return this.sendFriendError(client, 'This room is already full.')
    if (!areFriends(this.db, client.userId, toUserId)) {
      return this.sendFriendError(client, 'You can only invite friends.')
    }
    if (!this.isOnline(toUserId)) return this.sendFriendError(client, 'That friend is offline.')

    const fromUser = getUserById(this.db, client.userId)
    if (!fromUser) return
    this.sendToUser(toUserId, {
      type: 'game_invite',
      fromUser,
      code: room.code,
      gameId: room.gameId
    })
  }

  // --- Presence ------------------------------------------------------------

  private setIdentity(client: ClientState, userId: string): void {
    // If this socket was already someone else, drop that presence first.
    if (client.userId && client.userId !== userId) this.removePresence(client)
    client.userId = userId
    let sockets = this.presence.get(userId)
    if (!sockets) {
      sockets = new Set()
      this.presence.set(userId, sockets)
    }
    sockets.add(client.socket)
  }

  private removePresence(client: ClientState): void {
    if (!client.userId) return
    const sockets = this.presence.get(client.userId)
    if (!sockets) return
    sockets.delete(client.socket)
    if (sockets.size === 0) this.presence.delete(client.userId)
  }

  private isOnline(userId: string): boolean {
    return this.presence.has(userId)
  }

  /** Send a message to every live socket belonging to an account. */
  private sendToUser(userId: string, message: ServerMessage): void {
    const sockets = this.presence.get(userId)
    if (!sockets) return
    const data = encode(message)
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(data)
    }
  }

  /** Push a fresh friends payload to all of a user's sockets (if online). */
  private pushFriends(userId: string): void {
    if (!this.isOnline(userId)) return
    const payload = getFriendsPayload(this.db, userId, (id) => this.isOnline(id))
    this.sendToUser(userId, {
      type: 'friends_update',
      friends: payload.friends,
      incoming: payload.incoming,
      outgoing: payload.outgoing
    })
  }

  /**
   * A user's presence, requests or records changed: refresh their own friends
   * view and that of everyone connected to them, so online dots and records
   * update on both sides.
   */
  private broadcastPresenceChange(userId: string): void {
    this.pushFriends(userId)
    for (const relatedId of getRelatedUserIds(this.db, userId)) this.pushFriends(relatedId)
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(encode(message))
  }

  private handleClose(socket: WebSocket): void {
    const client = this.clients.get(socket)
    this.clients.delete(socket)
    if (!client) return
    const userId = client.userId
    this.removePresence(client)
    const room = this.getRoom(client)
    if (room && client.playerId) {
      this.removeFromRoom(room, client.playerId)
    }
    // Let friends see this account go offline (only once its last socket drops).
    if (userId && !this.isOnline(userId)) this.broadcastPresenceChange(userId)
  }
}
