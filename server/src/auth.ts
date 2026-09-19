/**
 * Account creation and authentication.
 *
 * Passwords are hashed with scrypt (Node built-in) and a per-user random salt;
 * the plaintext is never stored. Session tokens are opaque random ids held in
 * memory by {@link SessionStore} and handed to clients to resume identity after
 * a reconnect.
 */
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { PublicUser } from '@shared/types'
import type { DB } from './db'

const SCRYPT_KEYLEN = 64
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/
const MIN_PASSWORD_LENGTH = 6
const MAX_PASSWORD_LENGTH = 200

export type AuthResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string }

// --- Password hashing ------------------------------------------------------

/** Hash a password into a self-describing `scrypt$<salt>$<hash>` string. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

/** Constant-time verification of a password against a stored hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expectedHex] = parts
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// --- Account operations ----------------------------------------------------

function toPublicUser(row: { id: string; username: string }): PublicUser {
  return { id: row.id, username: row.username }
}

/** Create a new account. Fails on invalid input or a taken username. */
export function createUser(db: DB, username: string, password: string): AuthResult {
  const name = username.trim()
  if (!USERNAME_RE.test(name)) {
    return {
      ok: false,
      error: 'Usernames must be 3–24 characters: letters, numbers or underscores.'
    }
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(name)
  if (existing) return { ok: false, error: 'That username is already taken.' }

  const id = randomUUID()
  db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    hashPassword(password),
    Date.now()
  )
  return { ok: true, user: { id, username: name } }
}

/** Authenticate a username/password pair. */
export function authenticate(db: DB, username: string, password: string): AuthResult {
  const row = db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(username.trim()) as { id: string; username: string; password_hash: string } | undefined
  if (!row || !verifyPassword(password, row.password_hash)) {
    return { ok: false, error: 'Incorrect username or password.' }
  }
  return { ok: true, user: toPublicUser(row) }
}

export function getUserById(db: DB, id: string): PublicUser | null {
  const row = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id) as
    | { id: string; username: string }
    | undefined
  return row ? toPublicUser(row) : null
}

export function findUserByUsername(db: DB, username: string): PublicUser | null {
  const row = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username.trim()) as
    | { id: string; username: string }
    | undefined
  return row ? toPublicUser(row) : null
}

// --- Sessions --------------------------------------------------------------

/**
 * In-memory token → userId map. Tokens are minted on login/signup and let a
 * reconnecting client re-assert its identity without re-entering credentials.
 * Not persisted: a server restart simply requires clients to log in again.
 */
export class SessionStore {
  private tokens = new Map<string, string>()

  issue(userId: string): string {
    const token = randomUUID()
    this.tokens.set(token, userId)
    return token
  }

  resolve(token: string): string | null {
    return this.tokens.get(token) ?? null
  }

  revoke(token: string): void {
    this.tokens.delete(token)
  }
}
