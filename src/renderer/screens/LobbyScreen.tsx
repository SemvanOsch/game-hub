import { useState } from 'react'
import type { RoomState } from '@shared/types'
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
  const enoughPlayers = room.players.length >= room.minPlayers

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
