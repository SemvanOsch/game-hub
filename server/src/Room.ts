import type { WebSocket } from 'ws'
import { ROOM_LIMITS, type RoomPlayer, type RoomState } from '@shared/types'
import { encode, type ServerMessage } from '@shared/protocol'
import type { Category } from '@shared/yahtzee/categories'
import {
  createGame,
  keepDieAction,
  removePlayerFromGame,
  rollDiceAction,
  submitScoreAction,
  type ActionResult,
  type YahtzeeGameState
} from '@shared/yahtzee/engine'

interface PlayerConnection {
  id: string
  name: string
  socket: WebSocket
  connected: boolean
}

/**
 * A single multiplayer room. Owns the authoritative game state and the set of
 * connected players. Networking concerns (sockets, broadcast) live here;
 * all Yahtzee rules come from the shared engine.
 */
export class Room {
  readonly code: string
  readonly gameId: string
  hostId: string
  /** Ordered list of player ids (join order == turn order). */
  private order: string[] = []
  private players = new Map<string, PlayerConnection>()
  private game: YahtzeeGameState | null = null
  status: RoomState['status'] = 'lobby'

  constructor(code: string, gameId: string) {
    this.code = code
    this.gameId = gameId
    this.hostId = ''
  }

  get isEmpty(): boolean {
    return this.players.size === 0
  }

  get connectedCount(): number {
    return [...this.players.values()].filter((p) => p.connected).length
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id)
  }

  isFull(): boolean {
    return this.players.size >= ROOM_LIMITS.MAX_PLAYERS
  }

  addPlayer(id: string, name: string, socket: WebSocket): void {
    this.players.set(id, { id, name, socket, connected: true })
    this.order.push(id)
    if (!this.hostId) this.hostId = id
  }

  /** Remove a player entirely (used when they leave from the lobby). */
  removePlayer(id: string): void {
    this.players.delete(id)
    this.order = this.order.filter((pid) => pid !== id)
    if (this.hostId === id) this.reassignHost()
    if (this.game) {
      const next = removePlayerFromGame(this.game, id)
      this.game = next
      if (next) this.status = next.status === 'finished' ? 'finished' : 'in-game'
    }
  }

  /** Handle a socket dropping. Removes the player and (mid-game) rebuilds
   *  the game state so the remaining players can keep playing. */
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
      minPlayers: ROOM_LIMITS.MIN_PLAYERS,
      maxPlayers: ROOM_LIMITS.MAX_PLAYERS,
      gameId: this.gameId
    }
  }

  getGame(): YahtzeeGameState | null {
    return this.game
  }

  canStart(): boolean {
    return this.status === 'lobby' && this.connectedCount >= ROOM_LIMITS.MIN_PLAYERS
  }

  startGame(): void {
    this.game = createGame(this.order)
    this.status = 'in-game'
  }

  /** Reset a finished game back to a fresh lobby for a rematch. */
  returnToLobby(): void {
    this.game = null
    this.status = 'lobby'
  }

  /** Apply a validated game action from a player. */
  applyAction(
    playerId: string,
    action:
      | { kind: 'roll' }
      | { kind: 'keep'; index: number }
      | { kind: 'score'; category: Category }
  ): ActionResult {
    if (!this.game || this.status !== 'in-game') {
      return { ok: false, code: 'INVALID_ACTION', message: 'No game is in progress.' }
    }
    const result = this.runAction(this.game, playerId, action)
    if (result.ok) {
      this.game = result.state
      if (result.state.status === 'finished') this.status = 'finished'
    }
    return result
  }

  private runAction(
    game: YahtzeeGameState,
    playerId: string,
    action:
      | { kind: 'roll' }
      | { kind: 'keep'; index: number }
      | { kind: 'score'; category: Category }
  ): ActionResult {
    switch (action.kind) {
      case 'roll':
        return rollDiceAction(game, playerId)
      case 'keep':
        return keepDieAction(game, playerId, action.index)
      case 'score':
        return submitScoreAction(game, playerId, action.category)
    }
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
