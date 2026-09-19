/**
 * Strongly typed WebSocket protocol shared by the server and renderer.
 *
 * Design: the server is authoritative. Clients send *intents* (ClientMessage);
 * the server validates them and broadcasts the resulting authoritative state
 * (ServerMessage). Clients never mutate game state directly.
 */
import type { FriendsPayload, PublicUser, RoomState } from './types'

export const PROTOCOL_VERSION = 1

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export interface CreateRoomMessage {
  type: 'create_room'
  playerName: string
  gameId: string
}
export interface JoinRoomMessage {
  type: 'join_room'
  code: string
  playerName: string
}
export interface LeaveRoomMessage {
  type: 'leave_room'
}
export interface StartGameMessage {
  type: 'start_game'
}
/**
 * Generic in-game action. The `action` payload is opaque at the protocol level;
 * each game's engine validates and interprets it. This keeps the protocol from
 * accumulating one message type per game move.
 */
export interface GameActionMessage {
  type: 'game_action'
  action: unknown
}
/** Host action: return a finished game back to the lobby so it can be replayed. */
export interface ReturnToLobbyMessage {
  type: 'return_to_lobby'
}

// --- Accounts & friends (optional; guests never send these) ---------------

/** Create a new account. The server hashes the password; it is never stored raw. */
export interface SignupMessage {
  type: 'signup'
  username: string
  password: string
}
/** Authenticate with an existing account. */
export interface LoginMessage {
  type: 'login'
  username: string
  password: string
}
/** Re-authenticate a returning session using a previously issued token. */
export interface ResumeSessionMessage {
  type: 'resume_session'
  token: string
}
/** Drop the socket's authenticated identity (back to guest). */
export interface LogoutMessage {
  type: 'logout'
}
/** Send a friend request to another account by username. */
export interface FriendRequestMessage {
  type: 'friend_request'
  username: string
}
/** Accept or decline a pending incoming friend request. */
export interface RespondFriendRequestMessage {
  type: 'respond_friend_request'
  fromUserId: string
  accept: boolean
}
/** Remove an existing friend (or cancel an outgoing request). */
export interface RemoveFriendMessage {
  type: 'remove_friend'
  userId: string
}
/** Invite a friend to the sender's current room. Accepting reuses `join_room`. */
export interface InviteToRoomMessage {
  type: 'invite_to_room'
  toUserId: string
}

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | StartGameMessage
  | GameActionMessage
  | ReturnToLobbyMessage
  | SignupMessage
  | LoginMessage
  | ResumeSessionMessage
  | LogoutMessage
  | FriendRequestMessage
  | RespondFriendRequestMessage
  | RemoveFriendMessage
  | InviteToRoomMessage

export type ClientMessageType = ClientMessage['type']

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export type ServerErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'INVALID_CODE'
  | 'NOT_HOST'
  | 'GAME_ALREADY_STARTED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_IN_ROOM'
  | 'INVALID_ACTION'
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  | 'MALFORMED'
  | 'NAME_REQUIRED'
  | 'INTERNAL'

/** Sent only to the socket that created or joined a room, carrying its id. */
export interface JoinedMessage {
  type: 'joined'
  selfId: string
  room: RoomState
}
/** Broadcast whenever lobby membership or status changes. */
export interface RoomUpdateMessage {
  type: 'room_update'
  room: RoomState
}
/**
 * Sent on every applied game action (also on start_game). `view` is the
 * per-player, sanitized client state produced by the game engine, so hidden
 * information (e.g. an opponent's ship positions) never reaches the wrong
 * client. Its concrete shape depends on `gameId`.
 */
export interface GameStateMessage {
  type: 'game_state'
  room: RoomState
  gameId: string
  view: unknown
}
/** Sent once when the game finishes, with the game-specific results payload. */
export interface GameOverMessage {
  type: 'game_over'
  room: RoomState
  gameId: string
  view: unknown
  results: unknown
}
export interface ErrorMessage {
  type: 'error'
  code: ServerErrorCode
  message: string
}

// --- Accounts & friends ----------------------------------------------------

/**
 * Result of a signup / login / resume attempt. On success carries the session
 * token (persist client-side to resume later) and the account profile; on
 * failure carries a human-readable reason.
 */
export interface AuthResultMessage {
  type: 'auth_result'
  ok: boolean
  token?: string
  profile?: PublicUser
  error?: string
}
/** Pushed whenever the local user's friends, requests, or their presence change. */
export interface FriendsUpdateMessage {
  type: 'friends_update'
  friends: FriendsPayload['friends']
  incoming: FriendsPayload['incoming']
  outgoing: FriendsPayload['outgoing']
}
/** A non-fatal friend-action failure (e.g. unknown username, already friends). */
export interface FriendErrorMessage {
  type: 'friend_error'
  message: string
}
/** Pushed to a player when a friend invites them into a room. */
export interface GameInviteMessage {
  type: 'game_invite'
  fromUser: PublicUser
  code: string
  gameId: string
}

export type ServerMessage =
  | JoinedMessage
  | RoomUpdateMessage
  | GameStateMessage
  | GameOverMessage
  | ErrorMessage
  | AuthResultMessage
  | FriendsUpdateMessage
  | FriendErrorMessage
  | GameInviteMessage

export type ServerMessageType = ServerMessage['type']

// ---------------------------------------------------------------------------
// Safe (de)serialization helpers
// ---------------------------------------------------------------------------

export function encode(message: ServerMessage | ClientMessage): string {
  return JSON.stringify(message)
}

/** Parse a raw string into an object, returning null on malformed JSON. */
export function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
