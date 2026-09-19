import type { RoomState } from '@shared/types'
import type { FinalScore } from '@shared/yahtzee/engine'
import { Button } from '../components/Button'
import styles from './GameOverScreen.module.css'

interface GameOverScreenProps {
  room: RoomState
  results: FinalScore[]
  selfId: string
  isHost: boolean
  onPlayAgain: () => void
  onHome: () => void
}

export function GameOverScreen({
  room,
  results,
  selfId,
  isHost,
  onPlayAgain,
  onHome
}: GameOverScreenProps) {
  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const topScore = results[0]?.totals.grandTotal ?? 0
  const winners = results.filter((r) => r.rank === 1).map((r) => nameById.get(r.playerId) ?? 'Player')

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.trophy} aria-hidden>
          🏆
        </div>
        <h1 className={styles.title}>Game over</h1>
        <p className={styles.winner}>
          {winners.length > 1 ? `${winners.join(' & ')} tie` : `${winners[0] ?? 'Nobody'} wins`} with{' '}
          {topScore} points!
        </p>

        <ol className={styles.standings}>
          {results.map((result) => {
            const name = nameById.get(result.playerId) ?? 'Player'
            const isWinner = result.rank === 1
            const isSelf = result.playerId === selfId
            return (
              <li
                key={result.playerId}
                className={[styles.row, isWinner ? styles.winnerRow : ''].join(' ')}
              >
                <span className={styles.rank}>{medal(result.rank)}</span>
                <span className={styles.name}>
                  {name}
                  {isSelf ? <span className={styles.you}> (you)</span> : null}
                </span>
                <span className={styles.breakdown}>
                  upper {result.totals.upperTotal} · lower {result.totals.lowerTotal}
                </span>
                <span className={styles.total}>{result.totals.grandTotal}</span>
              </li>
            )
          })}
        </ol>

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

function medal(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}
