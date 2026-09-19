/**
 * Single shared WebSocket for the whole renderer.
 *
 * Both the multiplayer store (rooms/games) and the auth store (accounts/friends)
 * talk to the server over one connection. Each store subscribes to the server
 * messages it cares about and ignores the rest, so the socket lifecycle lives in
 * exactly one place.
 */
import type { ClientMessage, ServerMessage } from '@shared/protocol'
import { MULTIPLAYER_SERVER_URL } from '../config'
import { Connection } from './connection'

type MessageHandler = (message: ServerMessage) => void
type CloseHandler = () => void

const messageHandlers = new Set<MessageHandler>()
const closeHandlers = new Set<CloseHandler>()

let connection: Connection | null = null
let connecting: Promise<void> | null = null

/** Subscribe to every server message. Returns an unsubscribe function. */
export function onServerMessage(handler: MessageHandler): () => void {
  messageHandlers.add(handler)
  return () => messageHandlers.delete(handler)
}

/** Subscribe to socket disconnects (after having been open). */
export function onDisconnect(handler: CloseHandler): () => void {
  closeHandlers.add(handler)
  return () => closeHandlers.delete(handler)
}

export function isConnected(): boolean {
  return Boolean(connection?.isOpen)
}

/** Open the shared socket if needed. Concurrent callers share one attempt. */
export function ensureConnection(): Promise<void> {
  if (connection?.isOpen) return Promise.resolve()
  if (connecting) return connecting

  const conn = new Connection(MULTIPLAYER_SERVER_URL, {
    onMessage: (message) => {
      for (const handler of messageHandlers) handler(message)
    },
    onClose: () => {
      connection = null
      connecting = null
      for (const handler of closeHandlers) handler()
    },
    onError: () => {
      /* handled via connect() rejection / onClose */
    }
  })
  connection = conn
  connecting = conn.connect().then(
    () => {
      connecting = null
    },
    (err: Error) => {
      connection = null
      connecting = null
      throw err
    }
  )
  return connecting
}

export function sendMessage(message: ClientMessage): void {
  connection?.send(message)
}

export function closeConnection(): void {
  connection?.close()
  connection = null
  connecting = null
}
