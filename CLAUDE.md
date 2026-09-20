# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Game Hub — a desktop **multiplayer game launcher** (React + TypeScript + Electron) with an
authoritative WebSocket server. Games: **Yahtzee** (2–6 players) and **Battleships** (1v1).

Optional **accounts** add friends, per-game win/loss records, and direct game invites. Login is
optional — guests still play with just a display name; logging in unlocks the social features.

## Commands

```bash
npm run dev            # server (tsx watch, port 3001) + Electron/renderer, concurrently
npm run dev:server     # server only
npm run dev:client     # renderer/Electron only

npm test               # Vitest, run once
npm run test:watch
npx vitest run shared/battleships/engine.test.ts          # a single test file
npx vitest run -t "generateRandomFleet"                   # tests matching a name

npm run typecheck      # typechecks ALL three tsconfig projects (node, web, server)
npm run build          # typecheck + electron-vite build -> out/
npm run build:app      # build + electron-builder -> release/  (packaged installer)
```

There is no linter configured. Always run `npm run typecheck` before considering a change done —
`build` runs it too. Vitest only collects `shared/**/*.test.ts` and `server/**/*.test.ts` in a
Node environment (see `vitest.config.ts`); there are no renderer/DOM tests. Server tests use an
in-memory SQLite DB (`createDb(':memory:')`).

`build:app` sets `npmRebuild: false` (in `package.json`'s `build` field) on purpose:
`better-sqlite3` is a **server-only** native module, and the packaged desktop app (bundled into
`out/`) never loads it — so electron-builder must not try to native-rebuild it for Electron's ABI.

## Layout & TypeScript projects

- `shared/` — isomorphic domain logic, imported by both server and renderer. Keep it free of
  Node- and browser-specific imports.
- `server/` — Node WebSocket server (`ws`). No game rules here.
- `src/renderer/` — React app (Zustand for state, CSS Modules for styling).
- `electron/` — main + preload.

Path aliases: `@shared/*` → `shared/*` (all projects), `@/*` → `src/renderer/*` (web only).
Three composite tsconfigs compile separately: `tsconfig.node.json` (electron), `tsconfig.web.json`
(renderer), `tsconfig.server.json` (server). `strict`, `noUnusedLocals`, and `noUnusedParameters`
are on — prefix intentionally-unused params with `_`.

## Architecture: game-agnostic multiplayer core

The multiplayer core knows nothing about any specific game; games plug in through one interface.
Understanding this is the key to being productive here.

- **`shared/games/types.ts`** defines `GameEngine<S, V, A, R>`: `createGame`, `validateAction`
  (parses untrusted client input), `applyAction` (authoritative reducer), `removePlayer`,
  `getPlayerView` (sanitizes state per player), `isFinished`, `getResults`, and `getWinnerIds`
  (player ids of the winner(s), handling ties — lets the server record match results with no
  per-game branching).
- **`shared/games/registry.ts`** maps a game id → its engine. This is the single server dispatch
  point. Each game implements the engine in a `game.ts` adapter that wraps its pure rules
  (`shared/yahtzee/`, `shared/battleships/`).
- **`server/Room.ts`** owns sockets + authoritative state and drives everything through its
  engine — no `if (gameId === …)` branches. Player limits come from the engine
  (`minPlayers`/`maxPlayers`), not global constants.
- **`server/GameServer.ts`** routes client messages, owns all rooms, and broadcasts state.

**Protocol (`shared/protocol.ts`) is generic.** Clients send intents; the server validates and
broadcasts. In-game moves use one `game_action { action: unknown }` message (the engine validates
the payload). The server replies with `game_state`/`game_over` carrying a per-player `view` — never
the raw authoritative state. Do not add per-move message types. (Account/friend/invite messages
are a separate, non-game concern — see below.)

**Hidden information is server-enforced.** The authoritative state holds everything (e.g. both
Battleships fleets); `getPlayerView` strips what a player may not see (an opponent's unsunk ship
positions are *not serialized*, not merely hidden in the UI). Never send secret data to the client
and hide it with CSS. `shared/battleships/view.test.ts` guards this — keep it passing.

**Client mirrors the server split.** `src/renderer/store/multiplayerStore.ts` (Zustand) holds
`view`/`gameId`/`results` and exposes generic `sendAction`. `src/renderer/games/ui.ts` maps a
gameId → its in-game and game-over React components; `src/renderer/App.tsx` looks games up there
instead of branching. Home-screen cards come from `src/renderer/games/registry.ts` (separate from
the server engine registry). Game rule logic stays in `shared/<game>/`; components call actions.

**One shared socket.** `src/renderer/net/socket.ts` owns the single WebSocket; both
`multiplayerStore` (rooms/games) and `authStore` (accounts/friends) subscribe via `onServerMessage`
and each handles only the message types it cares about. Leaving a room keeps the socket open (the
auth session lives on it). Don't create a second connection.

## Accounts, friends & records

The persistence layer is the only stateful part of the server; keep it out of game rules.

- **`server/src/db.ts`** — SQLite (`better-sqlite3`, synchronous). Tables: `users`, `friendships`,
  `match_results` + `match_participants`. Path from `DATA_DIR`/`DB_PATH` (default `./data/`).
  `GameServer`'s constructor takes a `DB` so tests can inject `:memory:`.
- **`server/src/auth.ts`** — scrypt password hashing (built-in `crypto`, never plaintext) and an
  in-memory `SessionStore` (token → userId) so a reconnecting client resumes via `resume_session`.
- **`server/src/friends.ts`** — friendship graph (request/accept/decline), presence-aware friends
  payload, and head-to-head record tallies.
- **`GameServer`** tracks presence as `Map<userId, Set<WebSocket>>` (multi-window safe) and pushes
  `friends_update` when anything changes. A finished match is recorded **only when every
  participant is a logged-in account** (guest/mixed rooms are skipped), via `Room.getMatchOutcome()`
  + `engine.getWinnerIds`.

**Invites** reuse the room-code join path: `invite_to_room { toUserId }` → the server pushes
`game_invite { fromUser, code, gameId }` to the online friend, who accepts by sending a normal
`join_room` with that code. No separate join logic.

**Login is optional.** Guests use a display-name only (`profileStore`); logged-in users play under
their username. Keep guest quick-play working when touching the auth/friends flow.

## Adding a game

1. Pure rules + a `GameEngine` in `shared/<game>/`, registered in `shared/games/registry.ts`
   (implement all engine methods, including `getWinnerIds` so records work).
2. Components in `src/renderer/games/<game>/`, registered in `src/renderer/games/ui.ts`.
3. A card entry in `src/renderer/games/registry.ts`.

The lobby, rooms, networking, disconnect handling, per-player serialization, records, and invites
then work automatically.

## Server URL config

The renderer reads `VITE_MULTIPLAYER_SERVER_URL` (via `src/renderer/config.ts`), defaulting to
`ws://localhost:3001`. `.env` sets it for local dev; `.env.production` bakes the public `wss://`
URL into `build:app`. The server port comes from `PORT` / `MULTIPLAYER_SERVER_PORT` (default 3001).

The SQLite file path comes from `DATA_DIR`/`DB_PATH`. Cloud hosts have **ephemeral**
filesystems, so that file is wiped on every redeploy. The `Dockerfile` bundles **Litestream**,
which streams the DB to S3-compatible object storage (Cloudflare R2) and restores it on boot —
so no application code changes and no paid persistent disk are needed. Configure it via the
`R2_*` env vars in `litestream.yml` / `render.yaml` (`render.yaml` uses `runtime: docker`).
Alternatively, point `DATA_DIR` at a real persistent disk if the host offers one. Passwords
travel over TLS in prod (`wss://`); local dev is plaintext `ws://` (fine for localhost).
