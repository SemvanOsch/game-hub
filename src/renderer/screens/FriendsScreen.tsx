import { useState } from 'react'
import type { FriendSummary } from '@shared/types'
import { useAuthStore } from '../store/authStore'
import { getGame } from '../games/registry'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { Toast } from '../components/Toast'
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
                <FriendRow key={friend.userId} friend={friend} onRemove={removeFriend} />
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

      <Toast message={friendError} onDismiss={clearFriendError} />
    </div>
  )
}

function FriendRow({
  friend,
  onRemove
}: {
  friend: FriendSummary
  onRemove: (userId: string) => void
}) {
  return (
    <li className={styles.row}>
      <span className={styles.avatar}>
        {initial(friend.username)}
        <span
          className={friend.online ? styles.dotOnline : styles.dotOffline}
          title={friend.online ? 'Online' : 'Offline'}
        />
      </span>
      <div className={styles.friendMeta}>
        <span className={styles.name}>{friend.username}</span>
        <span className={styles.records}>{recordText(friend)}</span>
      </div>
      <Button size="sm" variant="ghost" onClick={() => onRemove(friend.userId)}>
        Remove
      </Button>
    </li>
  )
}

function initial(name: string): string {
  return name.charAt(0).toUpperCase() || '?'
}

/** "Yahtzee 3–2 · Battleships 1–0", or a hint when they've never played. */
function recordText(friend: FriendSummary): string {
  const played = friend.records.filter((r) => r.wins + r.losses > 0)
  if (played.length === 0) return 'No games played yet'
  return played
    .map((r) => `${getGame(r.gameId)?.name ?? r.gameId} ${r.wins}–${r.losses}`)
    .join(' · ')
}
