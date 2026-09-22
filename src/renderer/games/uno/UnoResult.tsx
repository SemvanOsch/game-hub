import type { UnoResults, UnoView } from '@shared/uno/view'
import { Button } from '../../components/Button'
import type { GameOverUIProps } from '../ui'
import styles from './UnoResult.module.css'

/**
 * UNO round-over screen. Winner-only scoring (see `shared/uno/RULES.md`): the
 * first player to empty their hand wins. Final card counts are shown for context.
 */
export function UnoResult({ room, view, results, selfId, isHost, onPlayAgain, onHome }: GameOverUIProps) {
  const state = view as UnoView
  const { winnerId } = results as UnoResults

  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const won = winnerId === selfId
  const winnerName = winnerId ? nameOf(winnerId) : 'Nobody'

  // Standings: the winner first (0 cards), then the rest by fewest cards left.
  const standings = [...state.players].sort((a, b) => {
    if (a.playerId === winnerId) return -1
    if (b.playerId === winnerId) return 1
    return a.cardCount - b.cardCount
  })

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.badge} aria-hidden>
          {won ? '🎉' : '🃏'}
        </div>
        <h1 className={[styles.outcome, won ? styles.victory : styles.defeat].join(' ')}>
          {won ? 'You win!' : `${winnerName} wins!`}
        </h1>
        <p className={styles.summary}>
          {won
            ? 'You emptied your hand first. Nicely played.'
            : `${winnerName} emptied their hand first.`}
        </p>

        <div className={styles.standings}>
          <div className={styles.standingsHead}>Cards remaining</div>
          {standings.map((p, i) => (
            <div
              key={p.playerId}
              className={[styles.row, p.playerId === winnerId ? styles.winnerRow : ''].join(' ')}
            >
              <span className={styles.rank}>{i + 1}</span>
              <span className={styles.name}>
                {nameOf(p.playerId)}
                {p.isSelf ? ' (You)' : ''}
              </span>
              <span className={styles.cards}>
                {p.playerId === winnerId ? 'Winner' : `${p.cardCount} left`}
              </span>
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
