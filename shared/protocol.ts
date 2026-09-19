/**
 * Strongly typed WebSocket protocol shared by the server and renderer.
 *
 * Design: the server is authoritative. Clients send *intents* (ClientMessage);
 * the server validates them and broadcasts the resulting authoritative state
 * (ServerMessage). Clients never mutate game state directly.
 */
import type { RoomState } from './types'

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

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | StartGameMessage
  | GameActionMessage
  | ReturnToLobbyMessage

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

export type ServerMessage =
  | JoinedMessage
  | RoomUpdateMessage
  | GameStateMessage
  | GameOverMessage
  | ErrorMessage

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
