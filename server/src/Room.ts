import type { WebSocket } from 'ws'
import type { RoomPlayer, RoomState } from '@shared/types'
import { encode, type ServerMessage } from '@shared/protocol'
import type { EngineActionResult, GameEngine } from '@shared/games/types'
import { DEFAULT_GAME_ID, getEngine } from '@shared/games/registry'

interface PlayerConnection {
  id: string
  name: string
  socket: WebSocket
  connected: boolean
  /** Account id if this player is logged in; null for guests. */
  userId: string | null
}

/**
 * A single multiplayer room. Owns the authoritative game state and the set of
 * connected players. Networking concerns (sockets, broadcast) live here; all
 * game rules come from the room's {@link GameEngine}, so the room is fully
 * game-agnostic.
 */
export class Room {
  readonly code: string
  readonly gameId: string
  private readonly engine: GameEngine
  hostId: string
  /** Ordered list of player ids (join order == turn order). */
  private order: string[] = []
  private players = new Map<string, PlayerConnection>()
  private game: unknown | null = null
  status: RoomState['status'] = 'lobby'
  /** Guards against recording the same finished game more than once. */
  private matchRecorded = false

  constructor(code: string, gameId: string) {
    this.code = code
    const engine = getEngine(gameId) ?? getEngine(DEFAULT_GAME_ID)!
    this.engine = engine
    this.gameId = engine.id
    this.hostId = ''
  }

  get minPlayers(): number {
    return this.engine.minPlayers
  }

  get maxPlayers(): number {
    return this.engine.maxPlayers
  }

  get isEmpty(): boolean {
    return this.players.size === 0
  }

  get connectedCount(): number {
    return [...this.players.values()].filter((p) => p.connected).length
  }

  get playerIds(): string[] {
    return [...this.order]
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id)
  }

  isFull(): boolean {
    return this.players.size >= this.maxPlayers
  }

  addPlayer(id: string, name: string, socket: WebSocket, userId: string | null = null): void {
    this.players.set(id, { id, name, socket, connected: true, userId })
    this.order.push(id)
    if (!this.hostId) this.hostId = id
  }

  /** Account id for a room player, or null if that player is a guest/unknown. */
  getUserId(playerId: string): string | null {
    return this.players.get(playerId)?.userId ?? null
  }

  /**
   * Winner account ids and all participant account ids for the finished game.
   * `recordable` is true only when every participant is a logged-in account,
   * which is the precondition for writing a match record.
   */
  getMatchOutcome(): { recordable: boolean; participantIds: string[]; winnerIds: string[] } {
    const participants = this.order.map((id) => this.getUserId(id))
    const recordable = participants.length > 0 && participants.every((uid) => uid !== null)
    const winnerIds = this.game
      ? this.engine
          .getWinnerIds(this.game)
          .map((pid) => this.getUserId(pid))
          .filter((uid): uid is string => uid !== null)
      : []
    return {
      recordable,
      participantIds: participants.filter((uid): uid is string => uid !== null),
      winnerIds
    }
  }

  /** Remove a player entirely (used when they leave from the lobby). */
  removePlayer(id: string): void {
    this.players.delete(id)
    this.order = this.order.filter((pid) => pid !== id)
    if (this.hostId === id) this.reassignHost()
    // Once a game is finished, preserve its final state so the results screen
    // keeps the winner, both fleets and the opponent's name intact — a player
    // leaving the game-over screen must not rewrite what the other sees.
    if (this.game && this.status !== 'finished') {
      const next = this.engine.removePlayer(this.game, id)
      this.game = next
      if (next) this.status = this.engine.isFinished(next) ? 'finished' : 'in-game'
    }
  }

  /** Handle a socket dropping. Removes the player and (mid-game) lets the engine
   *  rebuild the game state so the remaining players are handled cleanly. */
  handleDisconnect(id: string): void {
    if (!this.players.has(id)) return
    this.removePlayer(id)
  }

  private reassignHost(): void {
    this.hostId = this.order[0] ?? ''
  }

  toRoomState(): RoomState {
    const players: RoomPlayer[] = this.order
      .map((id) => this.players.get(id))
      .filter((p): p is PlayerConnection => Boolean(p))
      .map((p) => ({ id: p.id, name: p.name, connected: p.connected }))
    return {
      code: this.code,
      hostId: this.hostId,
      players,
      status: this.status,
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      gameId: this.gameId
    }
  }

  hasGame(): boolean {
    return this.game !== null
  }

  /** The sanitized, per-player view of the current game (null if no game). */
  getPlayerView(playerId: string): unknown {
    if (!this.game) return null
    return this.engine.getPlayerView(this.game, playerId)
  }

  getResults(): unknown {
    if (!this.game) return null
    return this.engine.getResults(this.game)
  }

  canStart(): boolean {
    return (
      this.status === 'lobby' &&
      this.connectedCount >= this.minPlayers &&
      this.connectedCount <= this.maxPlayers
    )
  }

  startGame(): void {
    this.game = this.engine.createGame(this.order)
    this.status = 'in-game'
    this.matchRecorded = false
  }

  /** Reset a finished game back to a fresh lobby for a rematch. */
  returnToLobby(): void {
    this.game = null
    this.status = 'lobby'
    this.matchRecorded = false
  }

  get hasRecordedMatch(): boolean {
    return this.matchRecorded
  }

  markMatchRecorded(): void {
    this.matchRecorded = true
  }

  /** Validate a raw client action against the engine. Returns null if invalid. */
  validateAction(raw: unknown): unknown | null {
    return this.engine.validateAction(raw)
  }

  /** Apply a validated game action from a player. */
  applyAction(playerId: string, action: unknown): EngineActionResult<unknown> {
    if (!this.game || this.status !== 'in-game') {
      return { ok: false, code: 'INVALID_ACTION', message: 'No game is in progress.' }
    }
    const result = this.engine.applyAction(this.game, playerId, action)
    if (result.ok) {
      this.game = result.state
      if (this.engine.isFinished(result.state)) this.status = 'finished'
    }
    return result
  }

  // --- Messaging -----------------------------------------------------------

  send(id: string, message: ServerMessage): void {
    const player = this.players.get(id)
    if (player && player.socket.readyState === player.socket.OPEN) {
      player.socket.send(encode(message))
    }
  }

  broadcast(message: ServerMessage): void {
    const data = encode(message)
    for (const player of this.players.values()) {
      if (player.socket.readyState === player.socket.OPEN) {
        player.socket.send(data)
      }
    }
  }
}
