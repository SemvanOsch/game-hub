import type { PokerResults, PokerView } from '@shared/poker/view'
import { Button } from '../../components/Button'
import { ChipPile } from '../../components/chips/ChipPile'
import type { GameOverUIProps } from '../ui'
import styles from './PokerResult.module.css'

/**
 * Overall poker game-over screen. Shows the winner, the reason they won, and the
 * final standings — eliminated players remain listed so the whole match reads
 * clearly. No new hand is ever started from here.
 */
export function PokerResult({
  room,
  view,
  results,
  selfId,
  isHost,
  onPlayAgain,
  onHome
}: GameOverUIProps) {
  const state = view as PokerView
  const { winnerId } = results as PokerResults

  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const won = winnerId === selfId
  const winnerName = winnerId ? nameOf(winnerId) : 'Nobody'
  const winnerChips = state.players.find((p) => p.playerId === winnerId)?.chips ?? 0

  const reasonText = 'Last player with chips remaining'

  // Final standings, richest first; eliminated players remain visible.
  const standings = [...state.players].sort((a, b) => b.chips - a.chips)

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.tag}>Game Over</div>
        <h1 className={[styles.outcome, won ? styles.victory : styles.defeat].join(' ')}>
          {won ? 'You win!' : `${winnerName} wins`}
        </h1>
        <p className={styles.reason}>{reasonText}</p>

        {winnerId ? (
          <div className={styles.winnerPile}>
            <ChipPile amount={winnerChips} size="large" label="chips" animateIn maxColumns={5} />
          </div>
        ) : null}

        <div className={styles.standings}>
          <div className={styles.standingsHead}>Final standings</div>
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
                {p.playerId === selfId ? ' (You)' : ''}
              </span>
              <span className={styles.status}>
                {p.playerId === winnerId ? 'Winner' : p.eliminated ? 'Eliminated' : 'Survivor'}
              </span>
              <span className={styles.chips}>{p.chips.toLocaleString()}</span>
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
