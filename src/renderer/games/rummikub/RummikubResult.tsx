import type { RummikubResults, RummikubView } from '@shared/rummikub/view'
import { Button } from '../../components/Button'
import type { GameOverUIProps } from '../ui'
import { RummikubIcon } from './RummikubIcon'
import styles from './RummikubResult.module.css'

/**
 * Rummikub match-over screen: the winner and every player's final tile count,
 * plus rematch / home.
 */
export function RummikubResult({
  room,
  view,
  results,
  selfId,
  isHost,
  onPlayAgain,
  onHome
}: GameOverUIProps) {
  const state = view as RummikubView
  const { winnerId } = results as RummikubResults

  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const won = winnerId === selfId
  const winnerName = winnerId ? nameOf(winnerId) : 'Nobody'

  // Fewest tiles left first (the winner has emptied their rack).
  const standings = [...state.players].sort((a, b) => a.tileCount - b.tileCount)

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.badge} aria-hidden>
          <RummikubIcon />
        </div>
        <h1 className={[styles.outcome, won ? styles.victory : styles.defeat].join(' ')}>
          {won ? 'You win!' : `${winnerName} wins!`}
        </h1>
        <p className={styles.summary}>
          {won
            ? 'You cleared your rack first — a clean sweep.'
            : `${winnerName} emptied their rack first.`}
        </p>

        <div className={styles.standings}>
          <div className={styles.standingsHead}>
            <span>Player</span>
            <span>Tiles left</span>
          </div>
          {standings.map((p, i) => (
            <div
              key={p.playerId}
              className={[styles.row, p.playerId === winnerId ? styles.winnerRow : '']
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.rank}>{i + 1}</span>
              <span className={styles.name}>
                {nameOf(p.playerId)}
                {p.isSelf ? ' (You)' : ''}
              </span>
              <span className={styles.tiles}>{p.tileCount}</span>
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
