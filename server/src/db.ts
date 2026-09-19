/**
 * SQLite persistence for accounts, friendships and match records.
 *
 * This is the project's only durable store. It is intentionally tiny and
 * synchronous (better-sqlite3), matching the single-process authoritative
 * server. Game rules never touch this file — only the account/friends/records
 * layer does.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export type DB = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friendships (
  requester_id TEXT NOT NULL,
  addressee_id TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (requester_id, addressee_id),
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_results (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id   TEXT NOT NULL,
  played_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS match_participants (
  match_id  INTEGER NOT NULL,
  user_id   TEXT NOT NULL,
  is_winner INTEGER NOT NULL,
  PRIMARY KEY (match_id, user_id),
  FOREIGN KEY (match_id) REFERENCES match_results(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_participants_user ON match_participants(user_id);
`

/** Apply the schema and pragmas to a fresh or existing connection. */
export function initSchema(db: DB): DB {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

/**
 * Open (and initialize) a database at `path`. Pass `:memory:` for tests.
 * Ensures the parent directory exists for file-backed databases.
 */
export function createDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  return initSchema(new Database(path))
}

/** Resolve the on-disk database path from the environment (see CLAUDE.md). */
export function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH
  const dir = process.env.DATA_DIR ?? './data'
  return `${dir}/gamehub.db`
}
