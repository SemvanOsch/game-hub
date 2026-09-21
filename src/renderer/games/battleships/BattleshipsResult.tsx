import { useState } from 'react'
import { SHIP_DEFINITIONS, type Ship } from '@shared/battleships/types'
import type { BattleshipsResults, BattleshipsView } from '@shared/battleships/view'
import { Button } from '../../components/Button'
import { BattleshipsBoard } from './BattleshipsBoard'
import { buildEnemyCells, buildOwnCells } from './boardModel'
import { FleetStatus, type FleetDisplayEntry } from './FleetStatus'
import type { GameOverUIProps } from '../ui'
import styles from './BattleshipsResult.module.css'

/**
 * Build fleet rows (with per-ship damage) from a revealed set of ships. Both
 * fleets are fully revealed once the game is over, so hit counts are safe here.
 */
function toFleetDisplay(ships: Ship[]): FleetDisplayEntry[] {
  return SHIP_DEFINITIONS.map((def) => {
    const ship = ships.find((s) => s.type === def.type)
    return {
      type: def.type,
      name: def.name,
      length: def.length,
      // A ship missing from the revealed set (e.g. opponent left) counts as gone.
      sunk: ship ? ship.sunk : true,
      damage: ship ? ship.hits : Array<boolean>(def.length).fill(false)
    }
  })
}

export function BattleshipsResult({
  room,
  view,
  results,
  selfId,
  isHost,
  onPlayAgain,
  onHome
}: GameOverUIProps) {
  const state = view as BattleshipsView
  const { winnerId } = results as BattleshipsResults

  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const myName = nameById.get(selfId) ?? 'You'
  const opponentName = (state.opponentId && nameById.get(state.opponentId)) || 'Opponent'
  const won = winnerId === selfId
  const winnerName = winnerId ? nameById.get(winnerId) ?? 'A player' : 'Nobody'

  const ownFleet = toFleetDisplay(state.own.ships)
  const enemyFleet = toFleetDisplay(state.enemy.revealedShips)

  // Let players inspect the final board before jumping to the results panel.
  const [phase, setPhase] = useState<'review' | 'results'>('review')

  if (phase === 'review') {
    const enemyGrid = buildEnemyCells(state)
    const ownGrid = buildOwnCells(state)
    return (
      <div className={styles.review}>
        <div className={styles.reviewHead}>
          <h1 className={[styles.outcome, won ? styles.victory : styles.defeat].join(' ')}>
            {won ? 'Victory!' : 'Defeat'}
          </h1>
          <p className={styles.summary}>
            Both fleets are revealed. Take a look, then see the full results.
          </p>
        </div>
        <div className={styles.boards}>
          <section className={styles.boardCol}>
            <div className={styles.boardHead}>
              <h2>Enemy Waters</h2>
              <span className={styles.boardSub}>{opponentName}&rsquo;s fleet</span>
            </div>
            <BattleshipsBoard title={`Enemy waters — ${opponentName}'s fleet`} grid={enemyGrid} />
          </section>
          <section className={styles.boardCol}>
            <div className={styles.boardHead}>
              <h2>Your Fleet</h2>
              <span className={styles.boardSub}>{myName}</span>
            </div>
            <BattleshipsBoard title={`Your fleet — ${myName}`} grid={ownGrid} />
          </section>
        </div>
        <div className={styles.actions}>
          <Button size="lg" onClick={() => setPhase('results')}>
            See results
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.badge} aria-hidden>
          {won ? '🏆' : '💥'}
        </div>
        <h1 className={[styles.outcome, won ? styles.victory : styles.defeat].join(' ')}>
          {won ? 'Victory!' : 'Defeat'}
        </h1>
        <p className={styles.summary}>
          {won ? 'You sank the enemy fleet.' : `${winnerName} sank your fleet.`}
        </p>

        <div className={styles.fleets}>
          <FleetStatus
            title={`${myName} — surviving ships`}
            fleet={ownFleet}
            aliveOnly
            emptyLabel="Your fleet was destroyed."
          />
          <FleetStatus
            title={`${opponentName} — surviving ships`}
            fleet={enemyFleet}
            aliveOnly
            emptyLabel="Their fleet was destroyed."
          />
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
