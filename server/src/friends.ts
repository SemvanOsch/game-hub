/**
 * Friendship graph and match records.
 *
 * Friendships are stored as a single directed row (requester → addressee) with
 * a status; "are these two friends" is a bidirectional query. Match records are
 * written only for games where every participant is a logged-in account (see
 * {@link recordMatch}'s caller), and head-to-head tallies drive the per-friend
 * win/loss display.
 */
import type { FriendsPayload, FriendSummary, GameRecord, PublicUser } from '@shared/types'
import type { DB } from './db'
import { findUserByUsername, getUserById } from './auth'

export type FriendActionResult = { ok: true } | { ok: false; error: string }

/** True if the two users have an accepted friendship (either direction). */
export function areFriends(db: DB, a: string, b: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = ? AND addressee_id = ?)
           OR (requester_id = ? AND addressee_id = ?))`
    )
    .get(a, b, b, a)
  return Boolean(row)
}

/** Any friendship row between the two users, in either direction. */
function edgeBetween(
  db: DB,
  a: string,
  b: string
): { requester_id: string; addressee_id: string; status: string } | undefined {
  return db
    .prepare(
      `SELECT requester_id, addressee_id, status FROM friendships
       WHERE (requester_id = ? AND addressee_id = ?)
          OR (requester_id = ? AND addressee_id = ?)`
    )
    .get(a, b, b, a) as
    | { requester_id: string; addressee_id: string; status: string }
    | undefined
}

/** Send a friend request from `fromId` to the account named `toUsername`. */
export function sendFriendRequest(
  db: DB,
  fromId: string,
  toUsername: string
): FriendActionResult {
  const target = findUserByUsername(db, toUsername)
  if (!target) return { ok: false, error: 'No player with that username.' }
  if (target.id === fromId) return { ok: false, error: "You can't add yourself." }

  const existing = edgeBetween(db, fromId, target.id)
  if (existing) {
    if (existing.status === 'accepted') return { ok: false, error: 'You are already friends.' }
    // A pending request already exists. If it was sent TO us, accept it instead.
    if (existing.requester_id === target.id) {
      return acceptRequest(db, fromId, target.id)
    }
    return { ok: false, error: 'A request is already pending.' }
  }

  db.prepare(
    `INSERT INTO friendships (requester_id, addressee_id, status, created_at)
     VALUES (?, ?, 'pending', ?)`
  ).run(fromId, target.id, Date.now())
  return { ok: true }
}

/** Accept the pending request `fromUserId` → `userId`. */
function acceptRequest(db: DB, userId: string, fromUserId: string): FriendActionResult {
  const result = db
    .prepare(
      `UPDATE friendships SET status = 'accepted'
       WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`
    )
    .run(fromUserId, userId)
  if (result.changes === 0) return { ok: false, error: 'That request no longer exists.' }
  return { ok: true }
}

/** Accept or decline an incoming request. Declining deletes the pending row. */
export function respondToRequest(
  db: DB,
  userId: string,
  fromUserId: string,
  accept: boolean
): FriendActionResult {
  if (accept) return acceptRequest(db, userId, fromUserId)
  db.prepare(
    `DELETE FROM friendships
     WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`
  ).run(fromUserId, userId)
  return { ok: true }
}

/** Remove a friendship or cancel an outgoing request (either direction). */
export function removeFriend(db: DB, userId: string, otherId: string): void {
  db.prepare(
    `DELETE FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?)
        OR (requester_id = ? AND addressee_id = ?)`
  ).run(userId, otherId, otherId, userId)
}

/** Ids of everyone connected to `userId` by any friendship row (any status). */
export function getRelatedUserIds(db: DB, userId: string): string[] {
  const rows = db
    .prepare(
      `SELECT requester_id AS a, addressee_id AS b FROM friendships
       WHERE requester_id = ? OR addressee_id = ?`
    )
    .all(userId, userId) as { a: string; b: string }[]
  const ids = new Set<string>()
  for (const row of rows) ids.add(row.a === userId ? row.b : row.a)
  return [...ids]
}

/** Head-to-head win/loss per game between `userId` and `otherId`. */
export function getHeadToHead(db: DB, userId: string, otherId: string): GameRecord[] {
  const rows = db
    .prepare(
      `SELECT mr.game_id AS gameId,
              SUM(CASE WHEN me.is_winner = 1 THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN them.is_winner = 1 THEN 1 ELSE 0 END) AS losses
       FROM match_results mr
       JOIN match_participants me ON me.match_id = mr.id AND me.user_id = ?
       JOIN match_participants them ON them.match_id = mr.id AND them.user_id = ?
       GROUP BY mr.game_id
       HAVING wins > 0 OR losses > 0`
    )
    .all(userId, otherId) as { gameId: string; wins: number; losses: number }[]
  return rows.map((r) => ({ gameId: r.gameId, wins: r.wins, losses: r.losses }))
}

/**
 * Build the full friends payload for `userId`: accepted friends (with presence
 * and head-to-head records), incoming requests, and outgoing requests.
 * `isOnline` reports live presence (managed outside the database).
 */
export function getFriendsPayload(
  db: DB,
  userId: string,
  isOnline: (id: string) => boolean
): FriendsPayload {
  const accepted = db
    .prepare(
      `SELECT requester_id AS a, addressee_id AS b FROM friendships
       WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`
    )
    .all(userId, userId) as { a: string; b: string }[]

  const friends: FriendSummary[] = []
  for (const row of accepted) {
    const otherId = row.a === userId ? row.b : row.a
    const user = getUserById(db, otherId)
    if (!user) continue
    friends.push({
      userId: user.id,
      username: user.username,
      online: isOnline(user.id),
      records: getHeadToHead(db, userId, otherId)
    })
  }
  friends.sort((x, y) => x.username.localeCompare(y.username))

  const incoming = db
    .prepare(
      `SELECT requester_id AS id FROM friendships
       WHERE addressee_id = ? AND status = 'pending'`
    )
    .all(userId)
    .map((r) => getUserById(db, (r as { id: string }).id))
    .filter((u): u is PublicUser => u !== null)

  const outgoing = db
    .prepare(
      `SELECT addressee_id AS id FROM friendships
       WHERE requester_id = ? AND status = 'pending'`
    )
    .all(userId)
    .map((r) => getUserById(db, (r as { id: string }).id))
    .filter((u): u is PublicUser => u !== null)

  return { friends, incoming, outgoing }
}

/**
 * Record a finished match. `participantIds` are the account ids of everyone who
 * played; `winnerIds` are the subset who won (more than one on a tie). Callers
 * must only pass matches where every participant is a logged-in account.
 */
export function recordMatch(
  db: DB,
  gameId: string,
  participantIds: string[],
  winnerIds: string[]
): void {
  if (participantIds.length === 0) return
  const winners = new Set(winnerIds)
  const insertMatch = db.prepare('INSERT INTO match_results (game_id, played_at) VALUES (?, ?)')
  const insertParticipant = db.prepare(
    'INSERT INTO match_participants (match_id, user_id, is_winner) VALUES (?, ?, ?)'
  )
  const tx = db.transaction(() => {
    const matchId = insertMatch.run(gameId, Date.now()).lastInsertRowid
    for (const id of participantIds) {
      insertParticipant.run(matchId, id, winners.has(id) ? 1 : 0)
    }
  })
  tx()
}
