/**
 * Shared domain types used by both the multiplayer server and the renderer.
 * Keep this file free of any runtime/environment-specific imports so it can be
 * consumed from Node (server) and the browser (renderer) alike.
 */

/** A player as tracked by a room (lobby-level identity, not game state). */
export interface RoomPlayer {
  id: string
  name: string
  /** Whether the player currently has an open socket. */
  connected: boolean
}

export type RoomStatus = 'lobby' | 'in-game' | 'finished'

/** Serializable snapshot of a room's lobby state shared with clients. */
export interface RoomState {
  code: string
  hostId: string
  players: RoomPlayer[]
  status: RoomStatus
  minPlayers: number
  maxPlayers: number
  /** Which game this room is playing (matches a registry game id). */
  gameId: string
}

export const ROOM_LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 6
} as const

// ---------------------------------------------------------------------------
// Accounts, friends & records
// ---------------------------------------------------------------------------

/** A registered account as exposed to clients (never includes secrets). */
export interface PublicUser {
  id: string
  username: string
}

/** Win/loss tally for one game, from the perspective of the local user. */
export interface GameRecord {
  gameId: string
  wins: number
  losses: number
}

/** A confirmed friend plus live presence and the head-to-head record vs them. */
export interface FriendSummary {
  userId: string
  username: string
  online: boolean
  /** Head-to-head record per game, from the local user's perspective. */
  records: GameRecord[]
}

/** The full friends payload the server pushes whenever anything changes. */
export interface FriendsPayload {
  friends: FriendSummary[]
  /** Requests others have sent to the local user (awaiting their response). */
  incoming: PublicUser[]
  /** Requests the local user has sent that are still pending. */
  outgoing: PublicUser[]
}
