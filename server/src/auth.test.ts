import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, type DB } from './db'
import { authenticate, createUser, getUserById, hashPassword, verifyPassword } from './auth'

describe('password hashing', () => {
  it('round-trips a correct password and rejects a wrong one', () => {
    const stored = hashPassword('correct horse battery')
    expect(stored.startsWith('scrypt$')).toBe(true)
    expect(verifyPassword('correct horse battery', stored)).toBe(true)
    expect(verifyPassword('wrong password', stored)).toBe(false)
  })

  it('produces a different hash each time (random salt)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })

  it('rejects a malformed stored hash without throwing', () => {
    expect(verifyPassword('x', 'not-a-real-hash')).toBe(false)
    expect(verifyPassword('x', 'scrypt$onlytwo')).toBe(false)
  })
})

describe('accounts', () => {
  let db: DB
  beforeEach(() => {
    db = createDb(':memory:')
  })

  it('creates an account and authenticates it', () => {
    const created = createUser(db, 'Sem', 'hunter2')
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const auth = authenticate(db, 'Sem', 'hunter2')
    expect(auth.ok).toBe(true)
    if (auth.ok) expect(auth.user.id).toBe(created.user.id)
  })

  it('is case-insensitive on username but rejects duplicates', () => {
    expect(createUser(db, 'Sem', 'hunter2').ok).toBe(true)
    const dup = createUser(db, 'SEM', 'another')
    expect(dup.ok).toBe(false)
  })

  it('rejects invalid usernames and short passwords', () => {
    expect(createUser(db, 'ab', 'hunter2').ok).toBe(false) // too short
    expect(createUser(db, 'has spaces', 'hunter2').ok).toBe(false)
    expect(createUser(db, 'valid', '123').ok).toBe(false) // password too short
  })

  it('rejects a wrong password on login', () => {
    createUser(db, 'Sem', 'hunter2')
    expect(authenticate(db, 'Sem', 'nope').ok).toBe(false)
    expect(authenticate(db, 'ghost', 'hunter2').ok).toBe(false)
  })

  it('looks up a user by id', () => {
    const created = createUser(db, 'Sem', 'hunter2')
    if (!created.ok) throw new Error('setup failed')
    expect(getUserById(db, created.user.id)?.username).toBe('Sem')
    expect(getUserById(db, 'missing')).toBeNull()
  })
})
