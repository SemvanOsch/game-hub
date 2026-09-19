import { useEffect, useRef, useState } from 'react'
import type { Coordinate } from '@shared/battleships/types'
import type { BattleshipsView } from '@shared/battleships/view'
import type { GameUIProps } from '../ui'
import { BattleshipsBoard } from './BattleshipsBoard'
import { FleetStatus } from './FleetStatus'
import { TurnIndicator } from './TurnIndicator'
import { buildEnemyCells, buildOwnCells } from './boardModel'
import { shotFeedback, shotKey } from './feedback'
import styles from './BattleshipsGame.module.css'

export function BattleshipsGame({ room, view, selfId, sendAction, onLeave }: GameUIProps) {
  const state = view as BattleshipsView
  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const myName = nameById.get(selfId) ?? 'You'
  const opponentName = (state.opponentId && nameById.get(state.opponentId)) || 'Opponent'
  const opponent = room.players.find((p) => p.id === state.opponentId)
  const opponentConnected = opponent?.connected ?? false

  const [target, setTarget] = useState<Coordinate | null>(null)

  // Transient shot feedback that fades after a few seconds.
  const [feedback, setFeedback] = useState<string | null>(null)
  const lastKey = useRef('')
  useEffect(() => {
    const key = shotKey(state)
    if (!key || key === lastKey.current) return
    lastKey.current = key
    setFeedback(shotFeedback(state))
    const timer = window.setTimeout(() => setFeedback(null), 4000)
    return () => window.clearTimeout(timer)
  }, [state])

  const enemyGrid = buildEnemyCells(state)
  const ownGrid = buildOwnCells(state)
  const canFire = state.yourTurn

  // The most recent shot animates on exactly one board: mine lands on Enemy
  // Waters, the opponent's lands on my own fleet.
  const last = state.lastShot
  const myShot = Boolean(last && last.by === selfId)
  const enemyAnimAt = last && myShot ? last.coordinate : null
  const ownAnimAt = last && !myShot ? last.coordinate : null
  const lastResult = last?.result ?? null

  const fire = (coordinate: Coordinate) => {
    if (!canFire) return
    setTarget(null)
    sendAction({ type: 'fire_shot', coordinate })
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave game
        </button>
        <div className={styles.matchup}>
          <span className={styles.me}>{myName}</span>
          <span className={styles.vs}>vs</span>
          <span className={styles.opp}>
            {opponentName}
            {!opponentConnected ? <span className={styles.offline}> (offline)</span> : null}
          </span>
        </div>
      </div>

      <TurnIndicator yourTurn={canFire} opponentName={opponentName} feedback={feedback} />

      <div className={styles.boards}>
        <section className={[styles.boardCol, canFire ? styles.active : ''].join(' ')}>
          <div className={styles.boardHead}>
            <h2>Enemy Waters</h2>
            <span className={styles.boardSub}>{opponentName}&rsquo;s fleet</span>
          </div>
          <BattleshipsBoard
            title={`Enemy waters — ${opponentName}'s fleet`}
            grid={enemyGrid}
            interactive={canFire}
            target={target}
            animateAt={enemyAnimAt}
            animateResult={lastResult}
            onFire={fire}
            onHoverTarget={setTarget}
          />
          <FleetStatus title="Enemy fleet" fleet={state.enemyFleet} />
        </section>

        <section className={styles.boardCol}>
          <div className={styles.boardHead}>
            <h2>Your Fleet</h2>
            <span className={styles.boardSub}>Incoming fire shown here</span>
          </div>
          <BattleshipsBoard
            title={`Your fleet — ${myName}`}
            grid={ownGrid}
            animateAt={ownAnimAt}
            animateResult={lastResult}
          />
          <FleetStatus title="Your fleet" fleet={state.ownFleet} />
        </section>
      </div>
    </div>
  )
}
