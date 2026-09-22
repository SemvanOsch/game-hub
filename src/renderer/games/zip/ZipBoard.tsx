import { useMemo, useRef } from 'react'
import {
  buildWallSet,
  cellRowCol,
  checkpointCell,
  checkpointCount,
  type ZipPuzzle
} from '@shared/zip/puzzles'
import {
  CELL,
  boardHeight,
  boardWidth,
  canExtend,
  cellAtPoint,
  cellCenter,
  cellCorner
} from './board'
import styles from './ZipBoard.module.css'

interface ZipBoardProps {
  puzzle: ZipPuzzle
  path: number[]
  onChange: (path: number[]) => void
  interactive: boolean
  /** Dim/lock styling for a finished or timed-out board. */
  locked?: boolean
}

/**
 * The Zip puzzle grid, rendered as inline SVG so cells, walls, checkpoints and
 * the drawn path stay crisp and themable at any grid size. Drawing uses pointer
 * events, so mouse, trackpad and touch all work: press on cell 1, drag through
 * adjacent cells, and drag back over the previous cell to trim. All move rules
 * are enforced locally (mirroring the server) so the path never goes illegal.
 */
export function ZipBoard({ puzzle, path, onChange, interactive, locked = false }: ZipBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drawing = useRef(false)
  const walls = useMemo(() => buildWallSet(puzzle), [puzzle])
  const w = boardWidth(puzzle)
  const h = boardHeight(puzzle)
  const n = checkpointCount(puzzle)
  const startCell = checkpointCell(puzzle, 1)
  const visited = useMemo(() => new Set(path), [path])
  const head = path.length > 0 ? path[path.length - 1] : -1

  const cellFromEvent = (e: React.PointerEvent): number => {
    const svg = svgRef.current
    if (!svg) return -1
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return -1
    const x = ((e.clientX - rect.left) / rect.width) * w
    const y = ((e.clientY - rect.top) / rect.height) * h
    return cellAtPoint(x, y, puzzle.rows, puzzle.cols)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return
    const cell = cellFromEvent(e)
    if (cell < 0) return
    if (cell === startCell) {
      // Press on the start cell (re)begins the path.
      onChange([cell])
      drawing.current = true
      svgRef.current?.setPointerCapture(e.pointerId)
    } else if (path.length > 0 && cell === head) {
      drawing.current = true
      svgRef.current?.setPointerCapture(e.pointerId)
    } else if (canExtend(puzzle, walls, path, cell)) {
      onChange([...path, cell])
      drawing.current = true
      svgRef.current?.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive || !drawing.current) return
    const cell = cellFromEvent(e)
    if (cell < 0) return
    if (path.length >= 2 && cell === path[path.length - 2]) {
      // Drag back onto the previous cell trims the last step.
      onChange(path.slice(0, -1))
    } else if (canExtend(puzzle, walls, path, cell)) {
      onChange([...path, cell])
    }
  }

  const endDraw = (e: React.PointerEvent) => {
    drawing.current = false
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId)
    }
  }

  const pathPoints = path.map((c) => cellCenter(c, puzzle.cols))
  const polyPoints = pathPoints.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <svg
      ref={svgRef}
      className={[styles.board, locked ? styles.locked : '', interactive ? styles.interactive : '']
        .filter(Boolean)
        .join(' ')}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Zip puzzle, ${puzzle.rows} by ${puzzle.cols}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDraw}
      onPointerCancel={endDraw}
      onPointerLeave={endDraw}
    >
      <rect x={0} y={0} width={w} height={h} rx={16} className={styles.bg} />

      {/* Cells */}
      {Array.from({ length: puzzle.rows * puzzle.cols }, (_, i) => {
        const { x, y } = cellCorner(i, puzzle.cols)
        return (
          <rect
            key={`c${i}`}
            x={x + 2}
            y={y + 2}
            width={CELL - 4}
            height={CELL - 4}
            rx={10}
            className={[styles.cell, visited.has(i) ? styles.visited : ''].filter(Boolean).join(' ')}
          />
        )
      })}

      {/* Drawn path */}
      {pathPoints.length >= 2 ? (
        <polyline points={polyPoints} className={styles.path} />
      ) : null}
      {/* Head marker */}
      {head >= 0 ? (
        <circle
          cx={pathPoints[pathPoints.length - 1].x}
          cy={pathPoints[pathPoints.length - 1].y}
          r={CELL * 0.16}
          className={styles.head}
        />
      ) : null}

      {/* Walls (drawn on top of cells for clarity) */}
      {puzzle.walls.map(([a, b], i) => {
        const pa = cellRowCol(a, puzzle.cols)
        const pb = cellRowCol(b, puzzle.cols)
        const ca = cellCorner(a, puzzle.cols)
        const cb = cellCorner(b, puzzle.cols)
        // Wall sits on the shared edge between the two cells.
        if (pa.row === pb.row) {
          // Horizontal neighbours → vertical wall on their shared vertical edge.
          const x = Math.max(ca.x, cb.x)
          const y = ca.y
          return <line key={`w${i}`} x1={x} y1={y + 4} x2={x} y2={y + CELL - 4} className={styles.wall} />
        }
        // Vertical neighbours → horizontal wall on their shared horizontal edge.
        const y = Math.max(ca.y, cb.y)
        const x = ca.x
        return <line key={`w${i}`} x1={x + 4} y1={y} x2={x + CELL - 4} y2={y} className={styles.wall} />
      })}

      {/* Checkpoints */}
      {Object.entries(puzzle.checkpoints).map(([idx, number]) => {
        const cell = Number(idx)
        const { x, y } = cellCenter(cell, puzzle.cols)
        const isEndpoint = number === 1 || number === n
        return (
          <g key={`k${idx}`}>
            <circle
              cx={x}
              cy={y}
              r={CELL * 0.3}
              className={[styles.checkpoint, isEndpoint ? styles.endpoint : ''].filter(Boolean).join(' ')}
            />
            <text
              x={x}
              y={y}
              className={[styles.checkpointText, isEndpoint ? styles.endpointText : '']
                .filter(Boolean)
                .join(' ')}
              dominantBaseline="central"
              textAnchor="middle"
            >
              {number}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
