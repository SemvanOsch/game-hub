import type { QueensLeaderboardRow } from '@shared/queens/view'
import styles from './QueensLeaderboard.module.css'

interface LeaderboardProps {
  rows: QueensLeaderboardRow[]
  nameById: Map<string, string>
  selfId: string
  /** Player ids that are no longer connected (shown greyed). */
  disconnected?: Set<string>
  /** Compact single-column strip vs. a fuller panel. */
  compact?: boolean
  title?: string
  /** Optional live per-player status (Solving / Finished), shown when provided. */
  statusById?: Map<string, 'solving' | 'finished' | 'dnf'>
}

/**
 * The cumulative standings. Shows points and position only — never per-round times
 * — so it is safe to display during a live round (the tension-preserving default
 * from the spec). When `statusById` is supplied it also shows each player's live
 * status (Solving / ✓ Finished / DNF) without revealing any time. Round times
 * appear only on the results / final screens.
 */
export function QueensLeaderboard({
  rows,
  nameById,
  selfId,
  disconnected,
  compact = false,
  title = 'Leaderboard',
  statusById
}: LeaderboardProps) {
  return (
    <div className={[styles.board, compact ? styles.compact : ''].filter(Boolean).join(' ')}>
      {!compact ? <h3 className={styles.title}>{title}</h3> : null}
      <ol className={styles.list}>
        {rows.map((row) => {
          const isSelf = row.playerId === selfId
          const gone = disconnected?.has(row.playerId)
          const status = statusById?.get(row.playerId)
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
              {status ? (
                <span
                  className={[
                    styles.status,
                    status === 'finished'
                      ? styles.stDone
                      : status === 'dnf'
                        ? styles.stDnf
                        : styles.stSolving
                  ].join(' ')}
                >
                  {status === 'finished' ? '✓ Finished' : status === 'dnf' ? 'DNF' : 'Solving'}
                </span>
              ) : null}
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
