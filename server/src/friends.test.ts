import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, type DB } from './db'
import { createUser } from './auth'
import {
  areFriends,
  getFriendsPayload,
  getHeadToHead,
  recordMatch,
  removeFriend,
  respondToRequest,
  sendFriendRequest
} from './friends'

/** Create an account and return its id. */
function makeUser(db: DB, username: string): string {
  const result = createUser(db, username, 'password')
  if (!result.ok) throw new Error(`failed to create ${username}`)
  return result.user.id
}

describe('friendships', () => {
  let db: DB
  let alice: string
  let bob: string

  beforeEach(() => {
    db = createDb(':memory:')
    alice = makeUser(db, 'alice')
    bob = makeUser(db, 'bob')
  })

  it('request → accept makes two users friends', () => {
    expect(sendFriendRequest(db, alice, 'bob').ok).toBe(true)
    expect(areFriends(db, alice, bob)).toBe(false) // still pending

    const payloadBob = getFriendsPayload(db, bob, () => false)
    expect(payloadBob.incoming.map((u) => u.id)).toContain(alice)
    const payloadAlice = getFriendsPayload(db, alice, () => false)
    expect(payloadAlice.outgoing.map((u) => u.id)).toContain(bob)

    expect(respondToRequest(db, bob, alice, true).ok).toBe(true)
    expect(areFriends(db, alice, bob)).toBe(true)
    expect(areFriends(db, bob, alice)).toBe(true)
  })

  it('declining a request removes it without creating a friendship', () => {
    sendFriendRequest(db, alice, 'bob')
    expect(respondToRequest(db, bob, alice, false).ok).toBe(true)
    expect(areFriends(db, alice, bob)).toBe(false)
    expect(getFriendsPayload(db, bob, () => false).incoming).toHaveLength(0)
  })

  it('rejects self-requests and unknown usernames', () => {
    expect(sendFriendRequest(db, alice, 'alice').ok).toBe(false)
    expect(sendFriendRequest(db, alice, 'nobody').ok).toBe(false)
  })

  it('rejects a duplicate outgoing request but auto-accepts a mutual one', () => {
    expect(sendFriendRequest(db, alice, 'bob').ok).toBe(true)
    expect(sendFriendRequest(db, alice, 'bob').ok).toBe(false) // already pending
    // Bob requesting Alice back should accept the existing request.
    expect(sendFriendRequest(db, bob, 'alice').ok).toBe(true)
    expect(areFriends(db, alice, bob)).toBe(true)
  })

  it('removeFriend severs the relationship both ways', () => {
    sendFriendRequest(db, alice, 'bob')
    respondToRequest(db, bob, alice, true)
    removeFriend(db, bob, alice)
    expect(areFriends(db, alice, bob)).toBe(false)
  })

  it('reports presence via the isOnline callback', () => {
    sendFriendRequest(db, alice, 'bob')
    respondToRequest(db, bob, alice, true)
    const online = new Set([bob])
    const payload = getFriendsPayload(db, alice, (id) => online.has(id))
    expect(payload.friends).toHaveLength(1)
    expect(payload.friends[0].online).toBe(true)
  })
})

describe('match records', () => {
  let db: DB
  let alice: string
  let bob: string

  beforeEach(() => {
    db = createDb(':memory:')
    alice = makeUser(db, 'alice')
    bob = makeUser(db, 'bob')
  })

  it('tallies head-to-head wins and losses per game', () => {
    recordMatch(db, 'battleships', [alice, bob], [alice]) // alice wins
    recordMatch(db, 'battleships', [alice, bob], [bob]) // bob wins
    recordMatch(db, 'battleships', [alice, bob], [alice]) // alice wins

    const aliceView = getHeadToHead(db, alice, bob)
    expect(aliceView).toEqual([{ gameId: 'battleships', wins: 2, losses: 1 }])

    // Symmetric from bob's perspective.
    const bobView = getHeadToHead(db, bob, alice)
    expect(bobView).toEqual([{ gameId: 'battleships', wins: 1, losses: 2 }])
  })

  it('separates records by game and only counts shared matches', () => {
    const carol = makeUser(db, 'carol')
    recordMatch(db, 'yahtzee', [alice, bob], [alice])
    recordMatch(db, 'yahtzee', [alice, carol], [carol]) // not vs bob
    recordMatch(db, 'battleships', [alice, bob], [bob])

    const vsBob = getHeadToHead(db, alice, bob)
    expect(vsBob).toContainEqual({ gameId: 'yahtzee', wins: 1, losses: 0 })
    expect(vsBob).toContainEqual({ gameId: 'battleships', wins: 0, losses: 1 })
    // The alice-vs-carol yahtzee game must not leak into the bob tally.
    const yahtzeeVsBob = vsBob.find((r) => r.gameId === 'yahtzee')
    expect(yahtzeeVsBob).toEqual({ gameId: 'yahtzee', wins: 1, losses: 0 })
  })

  it('surfaces records in the friends payload', () => {
    sendFriendRequest(db, alice, 'bob')
    respondToRequest(db, bob, alice, true)
    recordMatch(db, 'battleships', [alice, bob], [alice])

    const payload = getFriendsPayload(db, alice, () => true)
    expect(payload.friends[0].records).toEqual([
      { gameId: 'battleships', wins: 1, losses: 0 }
    ])
  })
})
