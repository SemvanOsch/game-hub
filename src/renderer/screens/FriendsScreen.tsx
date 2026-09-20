import { useState } from 'react'
import type { FriendSummary } from '@shared/types'
import { useAuthStore } from '../store/authStore'
import { GAMES } from '../games/registry'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { Toast } from '../components/Toast'
import { Modal } from '../components/Modal'
import styles from './FriendsScreen.module.css'

interface FriendsScreenProps {
  onBack: () => void
}

/** Friends hub: add by username, respond to requests, and view head-to-head records. */
export function FriendsScreen({ onBack }: FriendsScreenProps) {
  const friends = useAuthStore((s) => s.friends)
  const incoming = useAuthStore((s) => s.incoming)
  const outgoing = useAuthStore((s) => s.outgoing)
  const friendError = useAuthStore((s) => s.friendError)
  const sendRequest = useAuthStore((s) => s.sendRequest)
  const respond = useAuthStore((s) => s.respond)
  const removeFriend = useAuthStore((s) => s.removeFriend)
  const clearFriendError = useAuthStore((s) => s.clearFriendError)

  const [username, setUsername] = useState('')
  /** The friend whose records modal is open, if any. */
  const [selected, setSelected] = useState<FriendSummary | null>(null)

  // Keep the open modal in sync with live record/presence updates.
  const selectedFriend = selected
    ? (friends.find((f) => f.userId === selected.userId) ?? selected)
    : null

  const add = () => {
    const name = username.trim()
    if (!name) return
    sendRequest(name)
    setUsername('')
  }

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <button className={styles.back} onClick={onBack}>
          ← Back
        </button>
        <h2 className={styles.heading}>Friends</h2>

        <form
          className={styles.addRow}
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <TextField
            name="addFriend"
            placeholder="Add a friend by username"
            maxLength={24}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Button type="submit" disabled={!username.trim()}>
            Add
          </Button>
        </form>

        {incoming.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Requests</h3>
            <ul className={styles.list}>
              {incoming.map((user) => (
                <li key={user.id} className={styles.row}>
                  <span className={styles.avatar}>{initial(user.username)}</span>
                  <span className={styles.name}>{user.username}</span>
                  <div className={styles.actions}>
                    <Button size="sm" onClick={() => respond(user.id, true)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => respond(user.id, false)}>
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            Your friends <span className={styles.count}>{friends.length}</span>
          </h3>
          {friends.length === 0 ? (
            <p className={styles.empty}>
              No friends yet. Add someone by their username to get started.
            </p>
          ) : (
            <ul className={styles.list}>
              {friends.map((friend) => (
                <FriendRow
                  key={friend.userId}
                  friend={friend}
                  onRemove={removeFriend}
                  onSelect={() => setSelected(friend)}
                />
              ))}
            </ul>
          )}
        </section>

        {outgoing.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Pending</h3>
            <ul className={styles.list}>
              {outgoing.map((user) => (
                <li key={user.id} className={styles.row}>
                  <span className={styles.avatar}>{initial(user.username)}</span>
                  <span className={styles.name}>{user.username}</span>
                  <span className={styles.pendingTag}>Requested</span>
                  <Button size="sm" variant="ghost" onClick={() => removeFriend(user.id)}>
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <FriendRecordsModal friend={selectedFriend} onClose={() => setSelected(null)} />

      <Toast message={friendError} onDismiss={clearFriendError} />
    </div>
  )
}

function FriendRow({
  friend,
  onRemove,
  onSelect
}: {
  friend: FriendSummary
  onRemove: (userId: string) => void
  onSelect: () => void
}) {
  return (
    <li className={styles.row}>
      <button className={styles.friendButton} onClick={onSelect} title="View records">
        <span className={styles.avatar}>
          {initial(friend.username)}
          <span
            className={friend.online ? styles.dotOnline : styles.dotOffline}
            title={friend.online ? 'Online' : 'Offline'}
          />
        </span>
        <span className={styles.name}>{friend.username}</span>
        <span className={styles.viewHint} aria-hidden>
          ›
        </span>
      </button>
      <Button size="sm" variant="ghost" onClick={() => onRemove(friend.userId)}>
        Remove
      </Button>
    </li>
  )
}

/** Popup listing the local user's head-to-head record against a friend per game. */
function FriendRecordsModal({
  friend,
  onClose
}: {
  friend: FriendSummary | null
  onClose: () => void
}) {
  if (!friend) return null
  const recordFor = (gameId: string) => friend.records.find((r) => r.gameId === gameId)
  const anyPlayed = friend.records.some((r) => r.wins + r.losses > 0)

  return (
    <Modal open title={`Records vs ${friend.username}`} onClose={onClose}>
      <p className={styles.modalIntro}>Your head-to-head record against {friend.username}.</p>
      {!anyPlayed ? (
        <p className={styles.empty}>No games played together yet.</p>
      ) : (
        <div className={styles.recordList}>
          {GAMES.filter((g) => g.multiplayer).map((game) => {
            const rec = recordFor(game.id)
            const wins = rec?.wins ?? 0
            const losses = rec?.losses ?? 0
            const total = wins + losses
            return (
              <div key={game.id} className={styles.recordRow}>
                <span className={styles.recordIcon} aria-hidden>
                  {game.Icon ? <game.Icon /> : game.icon}
                </span>
                <span className={styles.recordGame}>{game.name}</span>
                {total === 0 ? (
                  <span className={styles.recordNone}>Not played</span>
                ) : (
                  <span className={styles.recordScore}>
                    <span className={styles.wins}>{wins}W</span>
                    <span className={styles.recordSep}>·</span>
                    <span className={styles.losses}>{losses}L</span>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

function initial(name: string): string {
  return name.charAt(0).toUpperCase() || '?'
}
