import type { CSSProperties } from 'react'
import { getAvailableRow } from '@shared/connect4/engine'
import {
  COLUMNS,
  ROWS,
  type Connect4Board as Board,
  type Connect4Coord,
  type Connect4PlayerColor
} from '@shared/connect4/types'
import type { Connect4LastMove } from '@shared/connect4/engine'
import { Connect4Disc } from './Connect4Disc'
import styles from './Connect4Board.module.css'

interface Connect4BoardProps {
  board: Board
  /** True when the local player may drop a disc (their turn, game live). */
  interactive?: boolean
  /** The local player's colour, used for the landing preview. */
  yourColor?: Connect4PlayerColor | null
  /** The currently highlighted column (hover or keyboard selection). */
  selectedColumn?: number | null
  onSelectColumn?: (column: number | null) => void
  onDrop?: (column: number) => void
  /** Cells forming the winning line, highlighted after a win. */
  winningCells?: Connect4Coord[]
  /** The most recent move, animated once as a falling disc. */
  dropAnim?: Connect4LastMove | null
}

function key(row: number, column: number): string {
  return `${row},${column}`
}

/**
 * The Connect 4 board: a 7×6 grid of circular sockets in a framed board.
 * Interaction is per-column — each column is one accessible button that drops a
 * disc into its lowest empty slot, with a translucent landing preview on hover.
 */
export function Connect4Board({
  board,
  interactive = false,
  yourColor = null,
  selectedColumn = null,
  onSelectColumn,
  onDrop,
  winningCells,
  dropAnim = null
}: Connect4BoardProps) {
  const winKeys = new Set((winningCells ?? []).map((c) => key(c.row, c.column)))
  const columnIndices = Array.from({ length: COLUMNS }, (_, i) => i)
  const frameStyle = { '--cols': COLUMNS, '--rows': ROWS } as CSSProperties

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    const current = selectedColumn ?? 0
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onSelectColumn?.((current - 1 + COLUMNS) % COLUMNS)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onSelectColumn?.((current + 1) % COLUMNS)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (selectedColumn !== null && getAvailableRow(board, selectedColumn) !== -1) {
        onDrop?.(selectedColumn)
      }
    }
  }

  return (
    <div
      className={styles.wrap}
      role="group"
      aria-label="Connect 4 board"
      onKeyDown={handleKeyDown}
    >
      <div className={styles.frame} style={frameStyle}>
        {columnIndices.map((column) => {
          const landingRow = getAvailableRow(board, column)
          const full = landingRow === -1
          const canDrop = interactive && !full
          const selected = selectedColumn === column
          const spaces = board.reduce((n, row) => (row[column] === null ? n + 1 : n), 0)
          const label = full
            ? `Column ${column + 1} — full`
            : `Column ${column + 1} — ${spaces} ${spaces === 1 ? 'space' : 'spaces'} remaining${
                interactive ? ', drop your disc here' : ''
              }`

          return (
            <button
              key={column}
              type="button"
              className={[
                styles.column,
                selected ? styles.selected : '',
                canDrop ? styles.droppable : ''
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!canDrop}
              aria-label={label}
              onMouseEnter={() => interactive && onSelectColumn?.(column)}
              onMouseLeave={() => interactive && onSelectColumn?.(null)}
              onFocus={() => interactive && onSelectColumn?.(column)}
              onClick={() => canDrop && onDrop?.(column)}
            >
              {Array.from({ length: ROWS }, (_, row) => {
                const cell = board[row][column]
                const showPreview =
                  canDrop && selected && row === landingRow && cell === null && yourColor
                const isDropped =
                  dropAnim && dropAnim.row === row && dropAnim.column === column
                return (
                  <span key={row} className={styles.slot}>
                    <Connect4Disc
                      player={showPreview ? yourColor : cell}
                      row={row}
                      column={column}
                      preview={Boolean(showPreview)}
                      winning={winKeys.has(key(row, column))}
                      dropping={Boolean(isDropped)}
                      dropRows={row}
                    />
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>
    </div>
  )
}
