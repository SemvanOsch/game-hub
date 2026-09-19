/**
 * Strongly typed WebSocket protocol shared by the server and renderer.
 *
 * Design: the server is authoritative. Clients send *intents* (ClientMessage);
 * the server validates them and broadcasts the resulting authoritative state
 * (ServerMessage). Clients never mutate game state directly.
 */
import type { RoomState } from './types'
import type { Category } from './yahtzee/categories'
import type { FinalScore, YahtzeeGameState } from './yahtzee/engine'

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
export interface RollDiceMessage {
  type: 'roll_dice'
}
export interface KeepDieMessage {
  type: 'keep_die'
  index: number
}
export interface SubmitScoreMessage {
  type: 'submit_score'
  category: Category
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
  | RollDiceMessage
  | KeepDieMessage
  | SubmitScoreMessage
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
/** Broadcast on every applied game action (also on start_game). */
export interface GameStateMessage {
  type: 'game_state'
  room: RoomState
  game: YahtzeeGameState
}
/** Broadcast once when the game finishes, with final standings. */
export interface GameOverMessage {
  type: 'game_over'
  room: RoomState
  game: YahtzeeGameState
  results: FinalScore[]
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
