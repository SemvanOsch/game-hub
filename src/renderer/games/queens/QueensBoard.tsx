import { useMemo, useRef, useState } from 'react'
import { cellRowCol, type QueensPuzzleView } from '@shared/queens/puzzles'
import {
  CELL,
  PAD,
  boardSize,
  cellAtPoint,
  cellCenter,
  cellCorner,
  findConflicts,
  regionColor
} from './board'
import styles from './QueensBoard.module.css'

interface QueensBoardProps {
  puzzle: QueensPuzzleView
  /** Cells holding a queen. */
  queens: number[]
  /** Cells the player has annotated with an X (local only, never submitted). */
  marks: number[]
  onQueensChange: (queens: number[]) => void
  onMarksChange: (marks: number[]) => void
  interactive: boolean
  /** Dim/lock styling for a finished or timed-out board. */
  locked?: boolean
}

/**
 * A polished queen glyph (crown), drawn as SVG paths so it stays crisp at any
 * grid size and themes with the board. `conflict` swaps it to the danger colour.
 */
function Queen({ x, y, conflict }: { x: number; y: number; conflict: boolean }) {
  const s = CELL * 0.32 // glyph half-size
  const cls = [styles.queen, conflict ? styles.queenBad : ''].filter(Boolean).join(' ')
  return (
    <g className={cls} transform={`translate(${x} ${y})`} pointerEvents="none">
      {/* Crown body */}
      <path
        d={`M ${-s} ${-s * 0.15}
            L ${-s} ${s * 0.55}
            L ${s} ${s * 0.55}
            L ${s} ${-s * 0.15}
            L ${s * 0.55} ${s * 0.15}
            L ${s * 0.2} ${-s * 0.5}
            L 0 ${s * 0.02}
            L ${-s * 0.2} ${-s * 0.5}
            L ${-s * 0.55} ${s * 0.15}
            Z`}
        className={styles.queenFill}
        strokeLinejoin="round"
      />
      {/* Crown jewels */}
      <circle cx={-s * 0.55} cy={-s * 0.32} r={s * 0.15} className={styles.queenGem} />
      <circle cx={s * 0.2} cy={-s * 0.68} r={s * 0.15} className={styles.queenGem} />
      <circle cx={s * 0.55} cy={-s * 0.32} r={s * 0.15} className={styles.queenGem} />
      {/* Base */}
      <rect
        x={-s * 1.05}
        y={s * 0.6}
        width={s * 2.1}
        height={s * 0.32}
        rx={s * 0.12}
        className={styles.queenFill}
      />
    </g>
  )
}

/**
 * The Queens puzzle grid, rendered as inline SVG. Each cell is filled by its
 * region colour; thick borders are drawn on edges between differing regions so the
 * layout reads without relying on colour (accessibility). Left-click toggles a
 * queen; right-click toggles an X annotation (local hint only). Conflicting queens
 * are highlighted red. All feedback is UX only — the server re-validates on submit.
 */
export function QueensBoard({
  puzzle,
  queens,
  marks,
  onQueensChange,
  onMarksChange,
  interactive,
  locked = false
}: QueensBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState(-1)
  const { size, regions } = puzzle
  const dim = boardSize(puzzle)
  const queenSet = useMemo(() => new Set(queens), [queens])
  const markSet = useMemo(() => new Set(marks), [marks])
  const conflicts = useMemo(() => findConflicts(puzzle, queens), [puzzle, queens])

  const cellFromEvent = (e: React.PointerEvent | React.MouseEvent): number => {
    const svg = svgRef.current
    if (!svg) return -1
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return -1
    const x = ((e.clientX - rect.left) / rect.width) * dim
    const y = ((e.clientY - rect.top) / rect.height) * dim
    return cellAtPoint(x, y, size)
  }

  const toggleQueen = (cell: number) => {
    if (queenSet.has(cell)) {
      onQueensChange(queens.filter((c) => c !== cell))
    } else {
      onQueensChange([...queens, cell])
      // Placing a queen clears any X annotation on that cell.
      if (markSet.has(cell)) onMarksChange(marks.filter((c) => c !== cell))
    }
  }

  const toggleMark = (cell: number) => {
    if (queenSet.has(cell)) return // can't annotate a queen cell
    if (markSet.has(cell)) onMarksChange(marks.filter((c) => c !== cell))
    else onMarksChange([...marks, cell])
  }

  const onClick = (e: React.MouseEvent) => {
    if (!interactive) return
    const cell = cellFromEvent(e)
    if (cell >= 0) toggleQueen(cell)
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!interactive) return
    const cell = cellFromEvent(e)
    if (cell >= 0) toggleMark(cell)
  }

  // Edge segments between cells whose region differs, plus the outer border.
  const regionEdges: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (let i = 0; i < size * size; i++) {
    const { row, col } = cellRowCol(i, size)
    const { x, y } = cellCorner(i, size)
    const region = regions[i]
    // Right edge.
    const right = col + 1 < size ? regions[i + 1] : -1
    if (right !== region) regionEdges.push({ x1: x + CELL, y1: y, x2: x + CELL, y2: y + CELL })
    // Bottom edge.
    const down = row + 1 < size ? regions[i + size] : -1
    if (down !== region) regionEdges.push({ x1: x, y1: y + CELL, x2: x + CELL, y2: y + CELL })
  }

  return (
    <svg
      ref={svgRef}
      className={[styles.board, locked ? styles.locked : '', interactive ? styles.interactive : '']
        .filter(Boolean)
        .join(' ')}
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={`Queens puzzle, ${size} by ${size}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerMove={(e) => interactive && setHover(cellFromEvent(e))}
      onPointerLeave={() => setHover(-1)}
    >
      <rect x={0} y={0} width={dim} height={dim} rx={12} className={styles.bg} />

      {/* Region-coloured cells */}
      {Array.from({ length: size * size }, (_, i) => {
        const { x, y } = cellCorner(i, size)
        return (
          <rect
            key={`c${i}`}
            x={x}
            y={y}
            width={CELL}
            height={CELL}
            fill={regionColor(regions[i])}
          />
        )
      })}

      {/* Thin cell gridlines */}
      {Array.from({ length: size + 1 }, (_, k) => (
        <g key={`g${k}`}>
          <line
            x1={PADX(k)}
            y1={PADX(0)}
            x2={PADX(k)}
            y2={PADX(size)}
            className={styles.gridline}
          />
          <line
            x1={PADX(0)}
            y1={PADX(k)}
            x2={PADX(size)}
            y2={PADX(k)}
            className={styles.gridline}
          />
        </g>
      ))}

      {/* Thick region boundaries */}
      {regionEdges.map((e, i) => (
        <line
          key={`e${i}`}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          className={styles.regionEdge}
        />
      ))}

      {/* Hover highlight (crisp outline, drawn above region borders) */}
      {interactive && hover >= 0 && !queenSet.has(hover)
        ? (() => {
            const { x, y } = cellCorner(hover, size)
            return (
              <rect
                x={x + 2.5}
                y={y + 2.5}
                width={CELL - 5}
                height={CELL - 5}
                rx={4}
                className={styles.hoverRing}
              />
            )
          })()
        : null}

      {/* X annotations */}
      {marks.map((cell) => {
        const { x, y } = cellCenter(cell, size)
        const r = CELL * 0.2
        return (
          <g key={`m${cell}`} pointerEvents="none" className={styles.mark}>
            <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
            <line x1={x + r} y1={y - r} x2={x - r} y2={y + r} />
          </g>
        )
      })}

      {/* Queens */}
      {queens.map((cell) => {
        const { x, y } = cellCenter(cell, size)
        return <Queen key={`q${cell}`} x={x} y={y} conflict={conflicts.has(cell)} />
      })}
    </svg>
  )
}

/** Board coordinate for the k-th gridline (0..size). */
function PADX(k: number): number {
  return PAD + k * CELL
}
