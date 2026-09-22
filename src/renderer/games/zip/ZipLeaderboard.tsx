import type { ZipLeaderboardRow } from '@shared/zip/view'
import styles from './ZipLeaderboard.module.css'

interface LeaderboardProps {
  rows: ZipLeaderboardRow[]
  nameById: Map<string, string>
  selfId: string
  /** Player ids that are no longer connected (shown greyed). */
  disconnected?: Set<string>
  /** Compact single-column strip vs. a fuller panel. */
  compact?: boolean
  title?: string
}

/**
 * The cumulative standings. Shows points and position only — never per-round
 * times — so it is safe to display during a live round (the tension-preserving
 * default from the spec). Round times appear only on the results/final screens.
 */
export function ZipLeaderboard({
  rows,
  nameById,
  selfId,
  disconnected,
  compact = false,
  title = 'Leaderboard'
}: LeaderboardProps) {
  return (
    <div className={[styles.board, compact ? styles.compact : ''].filter(Boolean).join(' ')}>
      {!compact ? <h3 className={styles.title}>{title}</h3> : null}
      <ol className={styles.list}>
        {rows.map((row) => {
          const isSelf = row.playerId === selfId
          const gone = disconnected?.has(row.playerId)
          return (
            <li
              key={row.playerId}
              className={[styles.row, isSelf ? styles.self : '', gone ? styles.gone : '']
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.position}>{row.position}</span>
              <span className={styles.name}>
                {nameById.get(row.playerId) ?? 'Player'}
                {isSelf ? <span className={styles.you}> (You)</span> : null}
              </span>
              <span className={styles.points}>
                {row.total}
                <span className={styles.pts}> pts</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
