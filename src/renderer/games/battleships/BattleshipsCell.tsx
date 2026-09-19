import type { CSSProperties } from 'react'
import { coordinateToLabel, type Coordinate } from '@shared/battleships/types'
import { SHIP_COLORS, type CellState, type ShipOutline } from './boardModel'
import styles from './BattleshipsCell.module.css'

interface BattleshipsCellProps {
  coordinate: Coordinate
  state: CellState
  /** Ship outline info when this cell belongs to a (revealed) ship. */
  ship?: ShipOutline | null
  /** Enemy board only: cell can be fired at. */
  interactive?: boolean
  /** Enemy board only: this cell is the currently hovered/targeted shot. */
  targeted?: boolean
  /** Play a one-shot animation because this cell was just fired at. */
  animate?: 'hit' | 'miss' | null
  onClick?: () => void
  onHover?: (coordinate: Coordinate | null) => void
}

/** Symbols back up color so states are never conveyed by color alone. */
const SYMBOL: Record<CellState, string> = {
  water: '',
  ship: '',
  miss: '•',
  hit: '✕',
  sunk: '✕',
  unknown: ''
}

const STATE_LABEL: Record<CellState, string> = {
  water: 'water',
  ship: 'your ship',
  miss: 'miss',
  hit: 'hit',
  sunk: 'sunk',
  unknown: 'unexplored'
}

export function BattleshipsCell({
  coordinate,
  state,
  ship,
  interactive = false,
  targeted = false,
  animate = null,
  onClick,
  onHover
}: BattleshipsCellProps) {
  const label = coordinateToLabel(coordinate)
  const classes = [
    styles.cell,
    styles[state],
    interactive ? styles.interactive : '',
    targeted ? styles.targeted : '',
    ship ? styles.shipCell : '',
    ship?.top ? styles.edgeTop : '',
    ship?.right ? styles.edgeRight : '',
    ship?.bottom ? styles.edgeBottom : '',
    ship?.left ? styles.edgeLeft : '',
    animate === 'hit' ? styles.animHit : '',
    animate === 'miss' ? styles.animMiss : ''
  ]
    .filter(Boolean)
    .join(' ')

  const style = ship
    ? ({ '--ship-color': SHIP_COLORS[ship.colorIndex] } as CSSProperties)
    : undefined

  const content = SYMBOL[state]

  if (interactive) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        onMouseEnter={() => onHover?.(coordinate)}
        onMouseLeave={() => onHover?.(null)}
        aria-label={`${label}: ${STATE_LABEL[state]}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={classes} style={style} aria-label={`${label}: ${STATE_LABEL[state]}`} role="img">
      {content}
    </div>
  )
}
