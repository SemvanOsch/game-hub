import type { SkipBoResults, SkipBoView } from '@shared/skipbo/view'
import { Button } from '../../components/Button'
import type { GameOverUIProps } from '../ui'
import styles from './SkipBoResult.module.css'

/**
 * Skip-Bo game-over screen. The first player to empty their stockpile wins.
 * Standings order the winner first, then everyone else by fewest stock cards
 * remaining. Per-player stats give the match some texture.
 */
export function SkipBoResult({ room, view, results, selfId, isHost, onPlayAgain, onHome }: GameOverUIProps) {
  const state = view as SkipBoView
  const { winnerId, stockLeft } = results as SkipBoResults

  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const won = winnerId === selfId
  const winnerName = winnerId ? nameOf(winnerId) : 'Nobody'

  const standings = [...state.players].sort((a, b) => {
    if (a.playerId === winnerId) return -1
    if (b.playerId === winnerId) return 1
    return (stockLeft[a.playerId] ?? 0) - (stockLeft[b.playerId] ?? 0)
  })

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.badge} aria-hidden>
          {won ? '🏆' : '🃏'}
        </div>
        <h1 className={[styles.outcome, won ? styles.victory : styles.defeat].join(' ')}>
          {won ? 'You win!' : `${winnerName} wins!`}
        </h1>
        <p className={styles.summary}>
          {won
            ? 'You emptied your stockpile first. Nicely played.'
            : `${winnerName} emptied their stockpile first.`}
        </p>

        <div className={styles.standings}>
          <div className={styles.head}>
            <span className={styles.hRank}>#</span>
            <span className={styles.hName}>Player</span>
            <span className={styles.hStat}>Stock left</span>
          </div>
          {standings.map((p, i) => {
            return (
              <div
                key={p.playerId}
                className={[styles.row, p.playerId === winnerId ? styles.winnerRow : ''].join(' ')}
              >
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.name}>
                  {nameOf(p.playerId)}
                  {p.isSelf ? ' (You)' : ''}
                </span>
                <span className={styles.stat}>
                  {p.playerId === winnerId ? '0' : (stockLeft[p.playerId] ?? 0)}
                </span>
              </div>
            )
          })}
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
