# Game Hub

A polished desktop **multiplayer game launcher** built with React, TypeScript and Electron.
It is designed as a small platform that hosts many games behind one game-agnostic multiplayer
core. The current line-up is **Yahtzee** (2–6), **Battleships** (1v1), **Blackjack** (2–6),
**Rummikub** (2–4), **Connect 4** (1v1) and **Texas Hold'em** (2–8).

Play as a guest with just a display name, or **log in** to add friends, keep per-game win/loss
records, and invite friends straight into a game. Either way you browse a home screen of games,
then **host** or **join** a real-time match over WebSockets and play a complete game together.

---

## Download & install

Grab the latest installer for your platform from the
[**Releases**](https://github.com/SemvanOsch/game-hub/releases/latest) page:

| Platform | File | How to install |
| -------- | ---- | -------------- |
| **Windows** | `GameHub-Setup-<version>.exe` | Run the installer and follow the prompts. Windows SmartScreen may warn about an unrecognized app — click **More info → Run anyway**. |
| **macOS** | `Game Hub-<version>.dmg` | Open the `.dmg` and drag **Game Hub** into Applications. |
| **Linux** | `Game Hub-<version>.AppImage` | Make it executable (`chmod +x`) and run it. |

Once installed, the app connects to the hosted multiplayer server automatically — just pick a
display name (or log in) and start playing. The app also checks for and installs updates on its
own via `electron-updater`.

> Prefer to build it yourself or run against your own server? See
> [Getting started](#getting-started) and [Building the desktop app](#building-the-desktop-app).

---

## Features

- 🎮 **Games launcher** — a home screen that renders from an extensible game registry.
- 🎲 **Yahtzee** — all 13 categories, upper-section subtotal + 35-point bonus, and full turn logic (2–6 players).
- 🚢 **Battleships** — a 1v1 naval duel on a 10×10 grid with server-generated fleets, turn-based firing, and hidden-information state (an opponent's unsunk ship positions are never sent to your client).
- 🃏 **Blackjack** — beat the dealer and outlast the table; first to 1,000 chips or last player standing wins (2–6 players).
- 🀄 **Rummikub** — classic tile-based strategy for 2–4 players.
- 🔴 **Connect 4** — four-in-a-row for 2 players.
- ♠️ **Texas Hold'em** — No-Limit poker for 2–8 with blinds, side pots and showdowns; last player with chips wins.
- 🌐 **Real multiplayer** — a standalone authoritative WebSocket server relays and validates state, so it works across separate computers.
- 🏠 **Host / Join** — short human-readable room codes (e.g. `K7P4Q`) and lobbies.
- 👤 **Optional accounts** — log in to add friends, track per-game head-to-head records, and send direct game invites; guests still play with just a display name.
- 🔒 **Secure Electron** — `contextIsolation: true`, `nodeIntegration: false`, a minimal preload bridge, and a strict CSP.
- 🧪 **Unit-tested game logic** — pure engine functions with Vitest coverage, including hidden-information guards.

---

## Tech stack

| Area              | Technology                          |
| ----------------- | ----------------------------------- |
| Desktop shell     | Electron 32                         |
| UI                | React 18 + TypeScript               |
| Build tooling     | Vite via `electron-vite`            |
| State management  | Zustand                             |
| Multiplayer       | Node.js WebSocket server (`ws`)     |
| Persistence       | SQLite (`better-sqlite3`)           |
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
│       ├── GameServer.ts   #   routes client messages, owns all rooms, presence
│       ├── Room.ts         #   one room: players, sockets, game state, broadcast
│       ├── db.ts           #   SQLite: users, friendships, match results
│       ├── auth.ts         #   scrypt password hashing + session store
│       ├── friends.ts      #   friendship graph + head-to-head records
│       ├── roomCode.ts     #   short human-readable room codes
│       └── config.ts       #   reads the port from the environment
│
├── shared/                 # Code shared by BOTH server and renderer
│   ├── types.ts            #   RoomState / RoomPlayer, limits
│   ├── protocol.ts         #   strongly typed client/server messages (generic game_action)
│   ├── games/              #   game-agnostic engine abstraction
│   │   ├── types.ts        #     GameEngine interface (create/apply/view/results/winners)
│   │   └── registry.ts     #     maps a game id to its engine (single dispatch point)
│   ├── yahtzee/            #   pure, framework-free game logic + tests
│   ├── battleships/        #   incl. view.ts (per-player sanitization) + security tests
│   ├── blackjack/
│   ├── rummikub/
│   ├── connect4/
│   └── poker/
│
├── src/renderer/           # React application (the UI)
│   ├── games/registry.ts   #   the extensible game registry (home-screen cards)
│   ├── games/ui.ts         #   maps a game id to its in-game / game-over components
│   ├── games/<game>/       #   per-game screens & components
│   ├── net/socket.ts       #   the single shared WebSocket client
│   ├── store/              #   Zustand stores (profile, multiplayer, auth)
│   ├── components/         #   reusable UI (Button, Die, Scorecard, Modal, …)
│   ├── screens/            #   Home, game menu, Join, Lobby, Game, Game over, Friends
│   ├── App.tsx             #   top-level navigation
│   └── config.ts           #   reads VITE_MULTIPLAYER_SERVER_URL
│
├── electron.vite.config.ts # main / preload / renderer build config
├── vitest.config.ts        # test config
└── .env / .env.example     # server URL + port configuration
```

**Separation of concerns**

- **Game rules** live in `shared/<game>` as pure functions — no React, no sockets. Each game exposes a `GameEngine` (`shared/games/types.ts`) and registers it in `shared/games/registry.ts`.
- **Networking** is game-agnostic: `server/` (authoritative) and `src/renderer/net` + `store/multiplayerStore.ts` (client) speak one generic `game_action` / per-player `view` protocol and never special-case a particular game.
- **Hidden information is server-enforced.** The server keeps full authoritative state and sends each client only its own sanitized `getPlayerView` — e.g. a Battleships opponent's unsunk ship positions are never transmitted, not merely hidden with CSS.
- **Accounts are a separate, non-game concern.** Persistence (users, friendships, records) lives only in `server/src/db.ts` and friends logic in `server/src/friends.ts`; game rules stay stateless.
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
> Deploy `server/` somewhere reachable and set `VITE_MULTIPLAYER_SERVER_URL` at build time
> (`.env.production` bakes the public `wss://` URL into `build:app`).

---

## How multiplayer works

The multiplayer server is **authoritative** — it is the single source of truth for every room
and game. This keeps all clients in sync and prevents cheating.

1. A client opens a WebSocket to the server (`VITE_MULTIPLAYER_SERVER_URL`).
2. **Host** sends `create_room`; the server allocates a unique room code and replies with `joined`.
3. **Joiners** send `join_room` with that code; the server validates it and broadcasts `room_update`.
4. The host sends `start_game`; the server creates the game and broadcasts `game_state`.
5. During play, clients send generic **intents** — one `game_action { action }` message per move.
   The server validates each against the engine's rules, applies it authoritatively, and
   broadcasts a per-player `game_state` view to everyone.
6. When the game finishes, the server broadcasts `game_over` with ranked results — and, if every
   participant is a logged-in account, records the match to each player's head-to-head record.

### Message protocol (see `shared/protocol.ts`)

The in-game protocol is **generic**: clients send intents (`create_room`, `join_room`,
`leave_room`, `start_game`, `game_action`, `return_to_lobby`) and the server replies with
`joined`, `room_update`, `game_state`, `game_over` or a typed `error`. No per-move message types
are added when a game is introduced — the engine validates the `game_action` payload.

Account, friend and invite messages (log in / register, `resume_session`, friend
request/accept/decline, `invite_to_room` → `game_invite`, `friends_update`) are a separate,
non-game concern handled over the same shared socket.

Invalid or out-of-turn actions produce a typed `error` (e.g. `ROOM_NOT_FOUND`, `ROOM_FULL`,
`NOT_YOUR_TURN`, `NOT_ENOUGH_PLAYERS`) rather than a crash.

### Disconnects

- A player leaving the **lobby** is simply removed from the roster.
- A player leaving **mid-game** is removed from the game via the engine's `removePlayer`; the
  remaining players keep playing.
- If the **host** leaves, the server promotes another player to host automatically.
- If a client loses its connection, the app shows a friendly message and returns to the menu.
  A logged-in client resumes its session on reconnect via `resume_session`.

---

## Adding another game

The multiplayer core is game-agnostic — no game is special-cased in the server or the shell.
Adding a game is entirely additive:

1. Add the game's pure logic under `shared/<game>/` (rules, state) and implement a
   `GameEngine` (`shared/games/types.ts`) exposing `createGame`, `validateAction`,
   `applyAction`, `removePlayer`, `getPlayerView`, `isFinished`, `getResults` and `getWinnerIds`.
2. Register the engine in [`shared/games/registry.ts`](shared/games/registry.ts). The server
   now runs it — player limits, turn handling, disconnects, per-player state serialization and
   match records all flow through the engine, with **no** `if (gameId === …)` branches.
3. Build the game's components under `src/renderer/games/<game>/` and register their in-game /
   game-over screens in [`src/renderer/games/ui.ts`](src/renderer/games/ui.ts).
4. Append an entry to `GAMES` in [`src/renderer/games/registry.ts`](src/renderer/games/registry.ts):

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

The home screen, cards, Play buttons, lobby, networking, records and invites update automatically.

---

## License

MIT
