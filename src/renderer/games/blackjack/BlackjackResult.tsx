import type { BlackjackResults, BlackjackView } from '@shared/blackjack/view'
import { WIN_TARGET_CHIPS, formatChips } from '@shared/blackjack/rules'
import { Button } from '../../components/Button'
import type { GameOverUIProps } from '../ui'
import styles from './BlackjackResult.module.css'

/**
 * Match-over screen. This is the OVERALL match result (last player standing),
 * distinct from a single hand's outcome, and shows every player's final chips.
 */
export function BlackjackResult({
  room,
  view,
  results,
  selfId,
  isHost,
  onPlayAgain,
  onHome
}: GameOverUIProps) {
  const state = view as BlackjackView
  const { winnerId } = results as BlackjackResults

  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const won = winnerId === selfId
  const winnerName = winnerId ? nameOf(winnerId) : 'Nobody'

  // A target win (winner reached the chip goal) reads differently from simply
  // outlasting everyone else.
  const winnerChips = state.players.find((p) => p.playerId === winnerId)?.chips ?? 0
  const byTarget = winnerChips >= WIN_TARGET_CHIPS
  const summary = byTarget
    ? won
      ? `You hit ${WIN_TARGET_CHIPS.toLocaleString()} chips first!`
      : `${winnerName} reached ${WIN_TARGET_CHIPS.toLocaleString()} chips first.`
    : won
      ? 'You outlasted the table with chips to spare.'
      : 'The last player standing takes the match.'

  // Final standings, richest first.
  const standings = [...state.players].sort((a, b) => b.chips - a.chips)

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.badge} aria-hidden>
          {won ? '🏆' : '🃏'}
        </div>
        <h1 className={[styles.outcome, won ? styles.victory : styles.defeat].join(' ')}>
          {won ? 'You win the match!' : `${winnerName} wins the match!`}
        </h1>
        <p className={styles.summary}>{summary}</p>

        <div className={styles.standings}>
          <div className={styles.standingsHead}>Final chip counts</div>
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
              <span className={styles.status}>
                {p.status === 'eliminated' ? 'Eliminated' : 'Survivor'}
              </span>
              <span className={styles.chips}>{formatChips(p.chips)}</span>
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
