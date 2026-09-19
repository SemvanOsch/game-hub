import { encode, safeParse, type ClientMessage, type ServerMessage } from '@shared/protocol'

export interface ConnectionHandlers {
  onMessage: (message: ServerMessage) => void
  /** Fired when the socket closes after having been open. */
  onClose: () => void
  /** Fired if the socket errors (including failure to ever connect). */
  onError: () => void
}

/**
 * Thin wrapper around the browser WebSocket that speaks the typed protocol.
 * Keeps all socket lifecycle concerns out of the store.
 */
export class Connection {
  private ws: WebSocket | null = null
  private opened = false

  constructor(
    private readonly url: string,
    private readonly handlers: ConnectionHandlers
  ) {}

  /** Open the socket. Resolves once connected, rejects if it cannot connect. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      let ws: WebSocket
      try {
        ws = new WebSocket(this.url)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to open socket'))
        return
      }
      this.ws = ws

      ws.onopen = () => {
        this.opened = true
        settled = true
        resolve()
      }

      ws.onmessage = (event) => {
        const data = safeParse(String(event.data)) as ServerMessage | null
        if (data && typeof data.type === 'string') {
          this.handlers.onMessage(data)
        }
      }

      ws.onerror = () => {
        if (!settled) {
          settled = true
          reject(new Error('Could not connect to the multiplayer server.'))
        }
        this.handlers.onError()
      }

      ws.onclose = () => {
        if (!settled) {
          settled = true
          reject(new Error('Could not connect to the multiplayer server.'))
        }
        if (this.opened) this.handlers.onClose()
      }
    })
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  send(message: ClientMessage): void {
    if (this.isOpen && this.ws) {
      this.ws.send(encode(message))
    }
  }

  close(): void {
    if (this.ws) {
      // Prevent onClose from firing our disconnect handler on an intentional close.
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
    this.opened = false
  }
}
