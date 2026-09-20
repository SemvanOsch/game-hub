import { Fragment } from 'react'
import { BOARD_SIZE, coordinateKey, coordinatesEqual, type Coordinate } from '@shared/battleships/types'
import type { ShotResult } from '@shared/battleships/types'
import type { AbilityType } from '@shared/battleships/abilities'
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
  /** Cells within the armed ability's preview area (client-side only). */
  previewCells?: Coordinate[]
  /** The cell just fired at on this board, animated once. */
  animateAt?: Coordinate | null
  animateResult?: ShotResult | null
  /** Cells to play the ability blast animation on. */
  blastCells?: Coordinate[]
  /** The struck centre; blast cells ripple outward from it. */
  blastCenter?: Coordinate | null
  /** Which ability's blast styling to use. */
  blastAbility?: AbilityType | null
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
  previewCells,
  animateAt,
  animateResult,
  blastCells,
  blastCenter,
  blastAbility,
  onFire,
  onHoverTarget
}: BattleshipsBoardProps) {
  const previewKeys = new Set((previewCells ?? []).map((c) => coordinateKey(c)))
  const blastKeys = new Set((blastCells ?? []).map((c) => coordinateKey(c)))
  // Ripple the blast outward from the centre: each ring lights up a touch later.
  const blastDelay = (coordinate: Coordinate): number => {
    if (!blastCenter) return 0
    return (Math.abs(coordinate.row - blastCenter.row) + Math.abs(coordinate.col - blastCenter.col)) * 55
  }
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
              const key = coordinateKey(coordinate)
              const isBlast = blastKeys.has(key)
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
                  preview={previewKeys.has(key)}
                  animate={animate}
                  blast={isBlast ? (blastAbility ?? null) : null}
                  blastDelay={isBlast ? blastDelay(coordinate) : 0}
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
