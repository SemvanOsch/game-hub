import type { ZipResults } from '@shared/zip/view'
import { Button } from '../../components/Button'
import type { GameOverUIProps } from '../ui'
import { formatTime, ordinal } from './board'
import styles from './ZipResult.module.css'

/**
 * Zip Battle Royale final results — the game-over screen. Shows the winner, the
 * final ranked standings, and a round-by-round breakdown of points and times,
 * then the standard rematch / return-home controls (rematch reuses the room's
 * return-to-lobby flow, which starts a fresh match with new puzzles).
 */
export function ZipResult({ room, results, selfId, isHost, onPlayAgain, onHome }: GameOverUIProps) {
  const final = results as ZipResults
  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const name = (id: string) => nameById.get(id) ?? 'Player'

  const winnerIds = final.winnerIds
  const tie = winnerIds.length > 1
  const iWon = winnerIds.includes(selfId)
  const heading = tie
    ? "It's a tie!"
    : iWon
      ? 'You win the match!'
      : winnerIds.length === 1
        ? `${name(winnerIds[0])} wins!`
        : 'Match complete'

  // Per-player, per-round points + times for the breakdown table.
  const roundOf = (playerId: string, roundIndex: number) =>
    final.rounds[roundIndex]?.placements.find((p) => p.playerId === playerId) ?? null

  const podium = final.standings.slice(0, 3)

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <p className={styles.kicker}>Zip Battle Royale</p>
        <h1 className={[styles.heading, iWon || tie ? styles.victory : styles.neutral].join(' ')}>
          {heading}
        </h1>

        {/* Podium (top 3) */}
        <div className={styles.podium}>
          {podium.map((s) => (
            <div
              key={s.playerId}
              className={[styles.podStep, styles[`pod${s.rank}` as 'pod1' | 'pod2' | 'pod3']]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.podRank}>{s.rank}</span>
              <span className={styles.podName}>
                {name(s.playerId)}
                {s.playerId === selfId ? <span className={styles.you}> (You)</span> : null}
              </span>
              <span className={styles.podPoints}>{s.total} pts</span>
            </div>
          ))}
        </div>

        {/* Round-by-round breakdown */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thPlayer}>Player</th>
                {final.rounds.map((_, i) => (
                  <th key={i}>R{i + 1}</th>
                ))}
                <th className={styles.thTotal}>Total</th>
              </tr>
            </thead>
            <tbody>
              {final.standings.map((s) => (
                <tr key={s.playerId} className={s.playerId === selfId ? styles.selfRow : ''}>
                  <td className={styles.tdPlayer}>
                    <span className={styles.rank}>{ordinal(s.rank)}</span>
                    <span className={styles.playerName}>{name(s.playerId)}</span>
                  </td>
                  {final.rounds.map((_, i) => {
                    const r = roundOf(s.playerId, i)
                    return (
                      <td key={i} className={styles.cell}>
                        <span className={styles.cellPts}>{r ? `+${r.points}` : '—'}</span>
                        <span className={styles.cellTime}>
                          {r ? (r.dnf ? 'DNF' : formatTime(r.completionMs ?? 0)) : ''}
                        </span>
                      </td>
                    )
                  })}
                  <td className={styles.tdTotal}>{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.actions}>
          {isHost ? (
            <Button size="lg" onClick={onPlayAgain}>
              Rematch
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
