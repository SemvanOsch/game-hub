# Game Launcher

A polished desktop **multiplayer game launcher** built with React, TypeScript and Electron.
It is designed as a small platform that can host many games; the first (and currently only)
playable game is **Yahtzee**.

Players choose a display name, browse a home screen of available games, then **host** or
**join** a real-time multiplayer match over WebSockets and play a complete game together.

---

## Features

- 🎮 **Games launcher** — a home screen that renders from an extensible game registry.
- 🎲 **Complete Yahtzee** — all 13 categories, upper-section subtotal + 35-point bonus, and full turn logic.
- 🌐 **Real multiplayer** — a standalone authoritative WebSocket server relays and validates state, so it works across separate computers.
- 🏠 **Host / Join** — short human-readable room codes (e.g. `K7P4Q`), lobbies, and up to 6 players.
- 🔒 **Secure Electron** — `contextIsolation: true`, `nodeIntegration: false`, a minimal preload bridge, and a strict CSP.
- 💾 **Local profile** — your display name is saved locally so you only set it once.
- 🧪 **Unit-tested game logic** — pure scoring/engine functions with Vitest coverage.

---

## Tech stack

| Area              | Technology                          |
| ----------------- | ----------------------------------- |
| Desktop shell     | Electron 32                         |
| UI                | React 18 + TypeScript               |
| Build tooling     | Vite via `electron-vite`            |
| State management  | Zustand                             |
| Multiplayer       | Node.js WebSocket server (`ws`)     |
| Styling           | CSS Modules + design tokens         |
| Testing           | Vitest                              |

---

## Project architecture

```
.
├── electron/               # Electron main process + preload (Node side)
│   ├── main/index.ts       #   creates the BrowserWindow, loads the renderer
│   └── preload/index.ts    #   safe, whitelisted bridge exposed as window.api
│
├── server/                 # Standalone authoritative multiplayer server
│   └── src/
│       ├── index.ts        #   boots the WebSocket server
│       ├── GameServer.ts   #   routes client messages, owns all rooms
│       ├── Room.ts         #   one room: players, sockets, game state, broadcast
│       ├── roomCode.ts     #   short human-readable room codes
│       └── config.ts       #   reads the port from the environment
│
├── shared/                 # Code shared by BOTH server and renderer
│   ├── types.ts            #   RoomState / RoomPlayer, limits
│   ├── protocol.ts         #   strongly typed client/server messages
│   └── yahtzee/            #   pure, framework-free game logic
│       ├── dice.ts         #     rollDice / rerollDice
│       ├── categories.ts   #     category ids, labels, hints
│       ├── scoring.ts      #     scoreCategory, calculatePossibleScores, totals
│       ├── engine.ts       #     game state machine + validated actions
│       └── *.test.ts       #     unit tests
│
├── src/renderer/           # React application (the UI)
│   ├── games/registry.ts   #   the extensible game registry
│   ├── net/connection.ts   #   typed WebSocket client wrapper
│   ├── store/              #   Zustand stores (profile + multiplayer)
│   ├── components/         #   reusable UI (Button, Die, Scorecard, Modal, …)
│   ├── screens/            #   Home, Yahtzee menu, Join, Lobby, Game, Game over
│   ├── App.tsx             #   top-level navigation
│   └── config.ts           #   reads VITE_MULTIPLAYER_SERVER_URL
│
├── electron.vite.config.ts # main / preload / renderer build config
├── vitest.config.ts        # test config
└── .env / .env.example     # server URL + port configuration
```

**Separation of concerns**

- **Game rules** live only in `shared/yahtzee` as pure functions — no React, no sockets.
- **Networking** lives in `server/` (authoritative) and `src/renderer/net` + `store/multiplayerStore.ts` (client). Neither imports Yahtzee UI.
- The **renderer never mutates game state directly**; it sends intents and renders the state the server broadcasts back.

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the server URL

Copy the example environment file (the defaults work for local development):

```bash
cp .env.example .env
```

```
VITE_MULTIPLAYER_SERVER_URL=ws://localhost:3001   # client → which server to connect to
MULTIPLAYER_SERVER_PORT=3001                       # server → which port to listen on
```

The client reads `VITE_MULTIPLAYER_SERVER_URL` (see `src/renderer/config.ts`). To play across
different machines, point it at the host's address, e.g. `ws://192.168.1.20:3001`, and run the
server there.

### 3. Run everything (recommended)

```bash
npm run dev
```

This launches **both** the multiplayer server and the Electron app together.

### Or run the pieces individually

```bash
npm run dev:server   # start only the WebSocket multiplayer server
npm run dev:client   # start only the Electron app (electron-vite dev)
```

---

## Scripts

| Script                  | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `npm run dev`           | Start the multiplayer server **and** the Electron app   |
| `npm run dev:server`    | Start only the WebSocket server (`tsx watch`)           |
| `npm run dev:client`    | Start only the Electron app                             |
| `npm run start:server`  | Start the server once (no watch) — useful in production |
| `npm run typecheck`     | Type-check renderer, Electron and server projects       |
| `npm run test`          | Run the Vitest unit tests                               |
| `npm run build`         | Type-check + build the renderer/main/preload bundles    |
| `npm run build:app`     | Build **and** package a desktop installer (electron-builder) |

---

## Building the desktop app

```bash
npm run build       # produces the bundled app in ./out
npm run build:app   # additionally packages an installer into ./release
```

> Note: the packaged desktop app still needs a running multiplayer server to reach.
> Deploy `server/` somewhere reachable and set `VITE_MULTIPLAYER_SERVER_URL` at build time.

---

## How multiplayer works

The multiplayer server is **authoritative** — it is the single source of truth for every room
and game. This keeps all clients in sync and prevents cheating.

1. A client opens a WebSocket to the server (`VITE_MULTIPLAYER_SERVER_URL`).
2. **Host** sends `create_room`; the server allocates a unique room code and replies with `joined`.
3. **Joiners** send `join_room` with that code; the server validates it and broadcasts `room_update`.
4. The host sends `start_game`; the server creates the game and broadcasts `game_state`.
5. During play, clients send **intents** — `roll_dice`, `keep_die`, `submit_score`. The server
   validates each against the rules (correct turn, rolls remaining, category unused, …), applies
   it via the shared engine, and broadcasts the new `game_state` to everyone.
6. When every category is filled, the server broadcasts `game_over` with ranked results.

### Message protocol (see `shared/protocol.ts`)

**Client → Server:** `create_room`, `join_room`, `leave_room`, `start_game`, `roll_dice`,
`keep_die`, `submit_score`, `return_to_lobby`.

**Server → Client:** `joined`, `room_update`, `game_state`, `game_over`, `error`.

All messages are strongly typed. Invalid or out-of-turn actions produce a typed `error`
(e.g. `ROOM_NOT_FOUND`, `ROOM_FULL`, `NOT_YOUR_TURN`, `NOT_ENOUGH_PLAYERS`) rather than a crash.

### Disconnects

- A player leaving the **lobby** is simply removed from the roster.
- A player leaving **mid-game** is removed from the game; the server rebuilds turn order so the
  remaining players keep playing.
- If the **host** leaves, the server promotes another player to host automatically.
- If a client loses its connection, the app shows a friendly message and returns to the menu.

### Where the server URL is configured

In `.env` (and `.env.example`) as `VITE_MULTIPLAYER_SERVER_URL`, consumed once in
`src/renderer/config.ts`. It is not hard-coded anywhere else.

---

## Adding another game later

The launcher is built around a registry, so Yahtzee is not special-cased in the shell.

1. Add the game's pure logic under `shared/<game>/` (rules, state, scoring).
2. Add its screens/components under `src/renderer/screens` and `components`.
3. Append an entry to `GAMES` in [`src/renderer/games/registry.ts`](src/renderer/games/registry.ts):

   ```ts
   {
     id: 'checkers',
     name: 'Checkers',
     description: 'Classic 2-player strategy.',
     icon: '⚫',
     multiplayer: true,
     minPlayers: 2,
     maxPlayers: 2,
     available: true
   }
   ```

4. Route the new `gameId` in `App.tsx` and, if it needs server-side rules, branch on
   `room.gameId` in the server. The home screen, cards and Play buttons update automatically.

---

## License

MIT
