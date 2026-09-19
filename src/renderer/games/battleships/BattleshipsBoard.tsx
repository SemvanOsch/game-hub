import { Fragment } from 'react'
import { BOARD_SIZE, coordinatesEqual, type Coordinate } from '@shared/battleships/types'
import type { ShotResult } from '@shared/battleships/types'
import { BattleshipsCell } from './BattleshipsCell'
import type { CellView } from './boardModel'
import styles from './BattleshipsBoard.module.css'

interface BattleshipsBoardProps {
  title: string
  grid: CellView[][]
  /** Enemy board: allow firing at unexplored cells. */
  interactive?: boolean
  /** Which cell (if any) is currently targeted. */
  target?: Coordinate | null
  /** The cell just fired at on this board, animated once. */
  animateAt?: Coordinate | null
  animateResult?: ShotResult | null
  onFire?: (coordinate: Coordinate) => void
  onHoverTarget?: (coordinate: Coordinate | null) => void
}

const COLUMN_LETTERS = 'ABCDEFGHIJ'.slice(0, BOARD_SIZE).split('')
const ROW_NUMBERS = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1)

export function BattleshipsBoard({
  title,
  grid,
  interactive = false,
  target,
  animateAt,
  animateResult,
  onFire,
  onHoverTarget
}: BattleshipsBoardProps) {
  return (
    <div className={styles.board} aria-label={title}>
      {/* One CSS grid: a labels gutter (row/column) around the 10×10 cells. */}
      <div className={styles.grid}>
        <div className={styles.corner} aria-hidden />
        {COLUMN_LETTERS.map((letter) => (
          <div key={`c-${letter}`} className={styles.colLabel} aria-hidden>
            {letter}
          </div>
        ))}

        {ROW_NUMBERS.map((rowNumber, row) => (
          <Fragment key={`r-${rowNumber}`}>
            <div className={styles.rowLabel} aria-hidden>
              {rowNumber}
            </div>
            {COLUMN_LETTERS.map((_, col) => {
              const coordinate: Coordinate = { row, col }
              const cell = grid[row][col]
              const canFire = interactive && cell.state === 'unknown'
              const animate =
                animateAt && animateResult && coordinatesEqual(animateAt, coordinate)
                  ? animateResult
                  : null
              return (
                <BattleshipsCell
                  key={`${row}-${col}`}
                  coordinate={coordinate}
                  state={cell.state}
                  ship={cell.ship}
                  interactive={canFire}
                  targeted={Boolean(target && coordinatesEqual(target, coordinate))}
                  animate={animate}
                  onClick={canFire ? () => onFire?.(coordinate) : undefined}
                  onHover={canFire ? onHoverTarget : undefined}
                />
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
