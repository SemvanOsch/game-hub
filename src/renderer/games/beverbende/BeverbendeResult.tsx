import type { BeverbendeResults } from '@shared/beverbende/view'
import { Button } from '../../components/Button'
import type { GameOverUIProps } from '../ui'
import styles from './BeverbendeResult.module.css'

/**
 * Beverbende game-over screen. The lowest cumulative score wins; ties share the win.
 * Standings list every player by ascending total.
 */
export function BeverbendeResult({
  room,
  results,
  selfId,
  isHost,
  onPlayAgain,
  onHome
}: GameOverUIProps) {
  const { winnerIds, standings, totalRounds } = results as BeverbendeResults

  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const won = winnerIds.includes(selfId)
  const winnerNames = winnerIds.map(nameOf)
  const tie = winnerIds.length > 1

  const headline = won
    ? tie
      ? 'You tie for the win!'
      : 'You win!'
    : tie
      ? `${winnerNames.join(' & ')} tie for the win!`
      : `${winnerNames[0] ?? 'Nobody'} wins!`

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.badge} aria-hidden>
          {won ? '🏆' : '🦫'}
        </div>
        <h1 className={[styles.outcome, won ? styles.victory : styles.defeat].join(' ')}>
          {headline}
        </h1>
        <p className={styles.summary}>
          Lowest score after {totalRounds} rounds wins.
        </p>

        <div className={styles.standings}>
          <div className={styles.head}>
            <span className={styles.hRank}>#</span>
            <span className={styles.hName}>Player</span>
            <span className={styles.hStat}>Total</span>
          </div>
          {standings.map((row, i) => (
            <div
              key={row.playerId}
              className={[styles.row, winnerIds.includes(row.playerId) ? styles.winnerRow : '']
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.rank}>{i + 1}</span>
              <span className={styles.name}>
                {nameOf(row.playerId)}
                {row.playerId === selfId ? ' (You)' : ''}
              </span>
              <span className={styles.stat}>{row.score}</span>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          {isHost ? (
            <Button size="lg" onClick={onPlayAgain}>
              Play again
            </Button>
          ) : (
            <span className={styles.hostNote}>Waiting for the host to start a rematch…</span>
          )}
          <Button size="lg" variant="secondary" onClick={onHome}>
            Return to Home
          </Button>
        </div>
      </div>
    </div>
  )
}
