import { useState } from 'react'
import type { RoomState } from '@shared/types'
import { useAuthStore } from '../store/authStore'
import { Button } from '../components/Button'
import styles from './LobbyScreen.module.css'

interface LobbyScreenProps {
  room: RoomState
  selfId: string
  isHost: boolean
  onStart: () => void
  onLeave: () => void
}

export function LobbyScreen({ room, selfId, isHost, onStart, onLeave }: LobbyScreenProps) {
  const [copied, setCopied] = useState(false)
  const session = useAuthStore((s) => s.session)
  const friends = useAuthStore((s) => s.friends)
  const inviteToRoom = useAuthStore((s) => s.inviteToRoom)
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const enoughPlayers = room.players.length >= room.minPlayers

  // Online friends who aren't already in this room (matched by display name).
  const presentNames = new Set(room.players.map((p) => p.name))
  const invitableFriends = friends.filter((f) => f.online && !presentNames.has(f.username))
  const canInvite = Boolean(session) && room.players.length < room.maxPlayers

  const invite = (userId: string) => {
    inviteToRoom(userId)
    setInvited((prev) => new Set(prev).add(userId))
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave lobby
        </button>

        <p className={styles.eyebrow}>Room code</p>
        <button className={styles.code} onClick={copyCode} title="Click to copy">
          {room.code}
        </button>
        <p className={styles.copyHint}>{copied ? 'Copied!' : 'Click the code to copy and share it'}</p>

        <div className={styles.playersHeader}>
          <h2>Players</h2>
          <span className={styles.playerCount}>
            {room.players.length}/{room.maxPlayers}
          </span>
        </div>

        <ul className={styles.playerList}>
          {room.players.map((p) => (
            <li key={p.id} className={styles.playerItem}>
              <span className={styles.avatar} aria-hidden>
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className={styles.playerName}>
                {p.name}
                {p.id === selfId ? <span className={styles.you}> (you)</span> : null}
              </span>
              {p.id === room.hostId ? <span className={styles.hostTag}>Host</span> : null}
            </li>
          ))}
          {Array.from({ length: Math.max(0, room.minPlayers - room.players.length) }).map((_, i) => (
            <li key={`empty-${i}`} className={`${styles.playerItem} ${styles.empty}`}>
              <span className={styles.avatar} aria-hidden>
                ?
              </span>
              <span className={styles.playerName}>Waiting for player…</span>
            </li>
          ))}
        </ul>

        {canInvite ? (
          <div className={styles.inviteSection}>
            <p className={styles.inviteHeading}>Invite friends</p>
            {invitableFriends.length === 0 ? (
              <p className={styles.inviteEmpty}>No friends online to invite right now.</p>
            ) : (
              <ul className={styles.inviteList}>
                {invitableFriends.map((friend) => (
                  <li key={friend.userId} className={styles.inviteRow}>
                    <span className={styles.inviteDot} aria-hidden />
                    <span className={styles.inviteName}>{friend.username}</span>
                    <Button
                      size="sm"
                      variant={invited.has(friend.userId) ? 'ghost' : 'secondary'}
                      disabled={invited.has(friend.userId)}
                      onClick={() => invite(friend.userId)}
                    >
                      {invited.has(friend.userId) ? 'Invited' : 'Invite'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className={styles.footer}>
          {isHost ? (
            <>
              <Button size="lg" fullWidth onClick={onStart} disabled={!enoughPlayers}>
                Start Game
              </Button>
              {!enoughPlayers ? (
                <p className={styles.note}>Need at least {room.minPlayers} players to start.</p>
              ) : null}
            </>
          ) : (
            <p className={styles.waiting}>Waiting for the host to start the game…</p>
          )}
        </div>
      </div>
    </div>
  )
}
