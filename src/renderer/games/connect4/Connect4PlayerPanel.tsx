import type { Connect4PlayerColor } from '@shared/connect4/types'
import { Connect4Disc } from './Connect4Disc'
import styles from './Connect4PlayerPanel.module.css'

interface PlayerEntry {
  name: string
  color: Connect4PlayerColor
  isYou: boolean
  active: boolean
  connected: boolean
}

interface Connect4PlayerPanelProps {
  you?: PlayerEntry
  opponent?: PlayerEntry
}

/** Both players' names, colours, and whose turn it is (active player emphasised). */
export function Connect4PlayerPanel({ you, opponent }: Connect4PlayerPanelProps) {
  return (
    <div className={styles.panel}>
      {you ? <PlayerBadge entry={you} /> : null}
      <span className={styles.vs}>vs</span>
      {opponent ? <PlayerBadge entry={opponent} /> : null}
    </div>
  )
}

function PlayerBadge({ entry }: { entry: PlayerEntry }) {
  return (
    <div className={[styles.badge, entry.active ? styles.active : ''].filter(Boolean).join(' ')}>
      <span className={styles.disc}>
        <Connect4Disc player={entry.color} />
      </span>
      <span className={styles.info}>
        <span className={styles.name}>
          {entry.name}
          {entry.isYou ? <span className={styles.you}> (You)</span> : null}
          {!entry.connected ? <span className={styles.offline}> · offline</span> : null}
        </span>
        <span className={styles.color}>{entry.color === 'red' ? 'Red' : 'Yellow'}</span>
      </span>
    </div>
  )
}
