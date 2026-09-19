import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { config } from './config'
import { GameServer } from './GameServer'

// A tiny HTTP server backs the WebSocket server so cloud platforms can
// health-check it over plain HTTP (GET / -> 200) and detect the open port.
const http = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('game-launcher multiplayer server: ok')
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server: http })
const game = new GameServer()

wss.on('connection', (socket) => {
  game.handleConnection(socket)
})

wss.on('error', (err) => {
  console.error('[multiplayer] server error:', err)
})

http.listen(config.port, config.host, () => {
  console.log(`[multiplayer] listening on ${config.host}:${config.port} (ws + http health check)`)
})

function shutdown(): void {
  console.log('\n[multiplayer] shutting down...')
  wss.close()
  http.close(() => process.exit(0))
  // Force-exit if sockets keep the process alive.
  setTimeout(() => process.exit(0), 1000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
