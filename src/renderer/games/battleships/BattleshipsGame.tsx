import { useEffect, useRef, useState } from 'react'
import type { Coordinate } from '@shared/battleships/types'
import type { BattleshipsView } from '@shared/battleships/view'
import { getAbilityPreview, type AbilityType } from '@shared/battleships/abilities'
import type { GameUIProps } from '../ui'
import { BattleshipsBoard } from './BattleshipsBoard'
import { FleetStatus } from './FleetStatus'
import { TurnIndicator } from './TurnIndicator'
import { AbilityPanel } from './AbilityPanel'
import { AbilityResultToast } from './AbilityResultToast'
import { buildEnemyCells, buildOwnCells } from './boardModel'
import { shotFeedback, shotKey } from './feedback'
import styles from './BattleshipsGame.module.css'

interface Blast {
  cells: Coordinate[]
  /** The struck centre — cells ripple outward from here. */
  center: Coordinate
  ability: AbilityType
  /** true = plays on Enemy Waters (my ability); false = on my own fleet. */
  onEnemy: boolean
}

export function BattleshipsGame({ room, view, selfId, sendAction, onLeave }: GameUIProps) {
  const state = view as BattleshipsView
  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const myName = nameById.get(selfId) ?? 'You'
  const opponentName = (state.opponentId && nameById.get(state.opponentId)) || 'Opponent'
  const opponent = room.players.find((p) => p.id === state.opponentId)
  const opponentConnected = opponent?.connected ?? false

  const [target, setTarget] = useState<Coordinate | null>(null)
  const [selectedAbility, setSelectedAbility] = useState<AbilityType | null>(null)

  // Transient shot/ability feedback, plus the ability blast + result toast.
  const [feedback, setFeedback] = useState<string | null>(null)
  const [blast, setBlast] = useState<Blast | null>(null)
  const [toast, setToast] = useState<BattleshipsView['lastAbility'] | null>(null)
  const lastKey = useRef('')

  const canFire = state.yourTurn

  // Disarm any selected ability when it stops being our turn.
  useEffect(() => {
    if (!canFire) setSelectedAbility(null)
  }, [canFire])

  useEffect(() => {
    const key = shotKey(state)
    if (!key || key === lastKey.current) return
    lastKey.current = key
    setFeedback(shotFeedback(state))
    const timers: number[] = []
    timers.push(window.setTimeout(() => setFeedback(null), 4000))

    // On an ability resolution, trigger the blast animation + result toast.
    const ev = state.lastAbility
    if (ev) {
      const onEnemy = ev.by === selfId
      setBlast({
        cells: ev.cells.map((c) => c.coordinate),
        center: ev.target,
        ability: ev.ability,
        onEnemy
      })
      setToast(ev)
      timers.push(window.setTimeout(() => setBlast(null), 1200))
      timers.push(window.setTimeout(() => setToast(null), 3800))
    }
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [state, selfId])

  const enemyGrid = buildEnemyCells(state)
  const ownGrid = buildOwnCells(state)

  // The most recent NORMAL shot animates on exactly one board (abilities use the
  // blast animation instead, so lastShot is cleared when an ability resolves).
  const last = state.lastShot
  const myShot = Boolean(last && last.by === selfId)
  const enemyAnimAt = last && myShot ? last.coordinate : null
  const ownAnimAt = last && !myShot ? last.coordinate : null
  const lastResult = last?.result ?? null

  // Preview the cells the armed ability would strike under the hovered target.
  const previewCells =
    selectedAbility && target ? getAbilityPreview(selectedAbility, target) : []

  const fire = (coordinate: Coordinate) => {
    if (!canFire) return
    if (selectedAbility) {
      sendAction({ type: 'use_ability', ability: selectedAbility, target: coordinate })
      setSelectedAbility(null)
    } else {
      sendAction({ type: 'fire_shot', coordinate })
    }
    setTarget(null)
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
            previewCells={previewCells}
            animateAt={enemyAnimAt}
            animateResult={lastResult}
            blastCells={blast?.onEnemy ? blast.cells : undefined}
            blastCenter={blast?.onEnemy ? blast.center : null}
            blastAbility={blast?.onEnemy ? blast.ability : null}
            onFire={fire}
            onHoverTarget={setTarget}
          />
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
            blastCells={blast && !blast.onEnemy ? blast.cells : undefined}
            blastCenter={blast && !blast.onEnemy ? blast.center : null}
            blastAbility={blast && !blast.onEnemy ? blast.ability : null}
          />
        </section>
      </div>

      <AbilityPanel
        abilities={state.abilities}
        selected={selectedAbility}
        enabled={canFire}
        onSelect={setSelectedAbility}
      />

      <div className={styles.fleets}>
        <FleetStatus title="Enemy fleet" fleet={state.enemyFleet} />
        <FleetStatus title="Your fleet" fleet={state.ownFleet} />
      </div>

      {toast ? <AbilityResultToast event={toast} selfId={selfId} /> : null}
    </div>
  )
}
