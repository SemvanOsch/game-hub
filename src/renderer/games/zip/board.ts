/**
 * Client-side Zip board helpers: geometry, time formatting and the incremental
 * move legality used while the player draws. The rules here mirror the server's
 * authoritative `validatePath`, but applied one step at a time so the path can
 * never enter an illegal state locally — the server still has the final say.
 */
import {
  areAdjacent,
  cellIndex,
  cellRowCol,
  checkpointCell,
  checkpointCount,
  hasWall,
  type ZipPuzzle
} from '@shared/zip/puzzles'

/** SVG units per cell and the outer padding around the grid. */
export const CELL = 60
export const PAD = 14

export function boardWidth(puzzle: Pick<ZipPuzzle, 'cols'>): number {
  return puzzle.cols * CELL + PAD * 2
}
export function boardHeight(puzzle: Pick<ZipPuzzle, 'rows'>): number {
  return puzzle.rows * CELL + PAD * 2
}

/** Centre point (SVG units) of a cell. */
export function cellCenter(index: number, cols: number): { x: number; y: number } {
  const { row, col } = cellRowCol(index, cols)
  return { x: PAD + col * CELL + CELL / 2, y: PAD + row * CELL + CELL / 2 }
}

/** Top-left corner (SVG units) of a cell. */
export function cellCorner(index: number, cols: number): { x: number; y: number } {
  const { row, col } = cellRowCol(index, cols)
  return { x: PAD + col * CELL, y: PAD + row * CELL }
}

/** Ordinal label for a 1-based place (1 → "1st", 2 → "2nd", …). */
export function ordinal(place: number): string {
  const mod100 = place % 100
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`
  switch (place % 10) {
    case 1:
      return `${place}st`
    case 2:
      return `${place}nd`
    case 3:
      return `${place}rd`
    default:
      return `${place}th`
  }
}

/** Format an elapsed time as m:ss.mmm (e.g. 1:23.481). */
export function formatTime(ms: number): string {
  if (ms < 0) ms = 0
  const totalMs = Math.floor(ms)
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
}

/** The checkpoint number the path must reach next (1-based), given what it holds. */
export function nextCheckpoint(puzzle: ZipPuzzle, path: readonly number[]): number {
  let count = 0
  for (const cell of path) {
    if (puzzle.checkpoints[cell] !== undefined) count++
  }
  return count + 1
}

/**
 * Whether `candidate` may be appended to the current path: it must be adjacent
 * to the head, not across a wall, not already used, and — if it is a numbered
 * cell — the next checkpoint in sequence.
 */
export function canExtend(
  puzzle: ZipPuzzle,
  walls: Set<string>,
  path: readonly number[],
  candidate: number
): boolean {
  if (path.length === 0) return candidate === checkpointCell(puzzle, 1)
  const head = path[path.length - 1]
  if (candidate === head) return false
  if (path.includes(candidate)) return false
  if (!areAdjacent(puzzle, head, candidate)) return false
  if (hasWall(walls, head, candidate)) return false
  const number = puzzle.checkpoints[candidate]
  if (number !== undefined && number !== nextCheckpoint(puzzle, path)) return false
  return true
}

/**
 * Given a pointer at SVG-space (x,y), the cell it is over, or -1 if outside the
 * grid. `cols`/`rows` bound the result to the board.
 */
export function cellAtPoint(x: number, y: number, rows: number, cols: number): number {
  const col = Math.floor((x - PAD) / CELL)
  const row = Math.floor((y - PAD) / CELL)
  if (row < 0 || col < 0 || row >= rows || col >= cols) return -1
  return cellIndex(row, col, cols)
}

/** Whether a fully-drawn path is locally complete (covers every cell, ends at N). */
export function isLocallyComplete(puzzle: ZipPuzzle, path: readonly number[]): boolean {
  const total = puzzle.rows * puzzle.cols
  if (path.length !== total) return false
  return path[path.length - 1] === checkpointCell(puzzle, checkpointCount(puzzle))
}
