import { useEffect, useRef, useState } from 'react'
import type { Connect4View } from '@shared/connect4/view'
import type { Connect4LastMove } from '@shared/connect4/engine'
import type { GameUIProps } from '../ui'
import { Connect4Board } from './Connect4Board'
import { Connect4PlayerPanel } from './Connect4PlayerPanel'
import styles from './Connect4Game.module.css'

export function Connect4Game({ room, view, selfId, sendAction, onLeave }: GameUIProps) {
  const state = view as Connect4View
  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const myName = nameById.get(selfId) ?? 'You'
  const opponentName = (state.opponentId && nameById.get(state.opponentId)) || 'Opponent'
  const opponentConnected = room.players.find((p) => p.id === state.opponentId)?.connected ?? false

  const myColor = state.yourColor
  const opponentColor = state.players.find((p) => p.id === state.opponentId)?.color ?? 'yellow'

  const yourTurn = state.yourTurn
  const currentName =
    state.currentPlayerId === selfId ? myName : nameById.get(state.currentPlayerId) ?? opponentName

  const [selectedColumn, setSelectedColumn] = useState<number | null>(null)
  // Guards against a double-click sending two drops before the server replies:
  // once we send, we go pending until the next authoritative view arrives.
  const [pending, setPending] = useState(false)
  const [dropAnim, setDropAnim] = useState<Connect4LastMove | null>(null)
  const lastMoveKey = useRef('')

  // A fresh authoritative view means our (or their) move landed: clear pending
  // and, for the newest move, trigger the falling-disc animation once.
  useEffect(() => {
    setPending(false)
    const lm = state.lastMove
    const key = lm ? `${lm.by}:${lm.row}:${lm.column}` : ''
    if (!key || key === lastMoveKey.current) return
    lastMoveKey.current = key
    setDropAnim(lm ?? null)
    const timer = window.setTimeout(() => setDropAnim(null), 500)
    return () => window.clearTimeout(timer)
  }, [state])

  // Drop any column selection as soon as it stops being our turn.
  useEffect(() => {
    if (!yourTurn) setSelectedColumn(null)
  }, [yourTurn])

  const canDrop = yourTurn && !pending

  const drop = (column: number) => {
    if (!canDrop) return
    sendAction({ type: 'drop_disc', column })
    setPending(true)
    setSelectedColumn(null)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave game
        </button>
        <h1 className={styles.title}>Connect 4</h1>
        <div className={styles.spacer} aria-hidden />
      </div>

      <div className={[styles.banner, yourTurn ? styles.you : styles.other].join(' ')}>
        <strong className={styles.headline}>
          {yourTurn ? 'Your turn' : `Waiting for ${currentName}…`}
        </strong>
        <span className={styles.sub}>
          {yourTurn
            ? 'Pick a column to drop your disc.'
            : `${currentName} is choosing a column.`}
        </span>
      </div>

      <Connect4PlayerPanel
        you={{
          name: myName,
          color: myColor ?? 'red',
          isYou: true,
          active: state.currentPlayerId === selfId,
          connected: true
        }}
        opponent={{
          name: opponentName,
          color: opponentColor,
          isYou: false,
          active: state.currentPlayerId === state.opponentId,
          connected: opponentConnected
        }}
      />

      <div className={styles.boardArea}>
        <Connect4Board
          board={state.board}
          interactive={canDrop}
          yourColor={myColor}
          selectedColumn={selectedColumn}
          onSelectColumn={setSelectedColumn}
          onDrop={drop}
          dropAnim={dropAnim}
        />
      </div>

      {!opponentConnected ? (
        <p className={styles.notice}>
          {opponentName} disconnected. Waiting to see if they reconnect…
        </p>
      ) : null}
    </div>
  )
}
