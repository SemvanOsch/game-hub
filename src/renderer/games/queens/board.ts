/**
 * Client-side Queens board helpers: geometry, region colours, time formatting and
 * the local completeness check used to trigger auto-submit. Conflict detection for
 * live feedback comes straight from the shared `findConflicts` so it mirrors the
 * server rules exactly — the server still has the final say.
 */
import { cellRowCol, type QueensPuzzleView } from '@shared/queens/puzzles'
import { findConflicts } from '@shared/queens/validate'

/** SVG units per cell and the outer padding around the grid. */
export const CELL = 56
export const PAD = 10

export function boardSize(puzzle: Pick<QueensPuzzleView, 'size'>): number {
  return puzzle.size * CELL + PAD * 2
}

/** Top-left corner (SVG units) of a cell. */
export function cellCorner(index: number, size: number): { x: number; y: number } {
  const { row, col } = cellRowCol(index, size)
  return { x: PAD + col * CELL, y: PAD + row * CELL }
}

/** Centre point (SVG units) of a cell. */
export function cellCenter(index: number, size: number): { x: number; y: number } {
  const { row, col } = cellRowCol(index, size)
  return { x: PAD + col * CELL + CELL / 2, y: PAD + row * CELL + CELL / 2 }
}

/**
 * Region fill colours. Chosen to stay distinct from one another and legible in
 * both themes; the board also draws thick borders between differing regions, so
 * the layout never relies on colour alone (accessibility). Up to 8 regions (the
 * hardest board is 8×8 → 8 regions).
 */
export const REGION_COLORS = [
  '#e5738a', // rose
  '#6d9eeb', // blue
  '#8fbc7a', // green
  '#f2b45c', // amber
  '#a988e6', // violet
  '#5ecbc0', // teal
  '#d98f5a', // clay
  '#c6cf6b' // lime
]

export function regionColor(region: number): string {
  return REGION_COLORS[region % REGION_COLORS.length]
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

/** Given a pointer at SVG-space (x,y), the cell it is over, or -1 if outside. */
export function cellAtPoint(x: number, y: number, size: number): number {
  const col = Math.floor((x - PAD) / CELL)
  const row = Math.floor((y - PAD) / CELL)
  if (row < 0 || col < 0 || row >= size || col >= size) return -1
  return row * size + col
}

/** Re-export the shared conflict finder for the board component. */
export { findConflicts }

/**
 * Whether the current placement is locally complete AND conflict-free, so the
 * client can optimistically auto-submit (the server re-validates regardless).
 */
export function isLocallyComplete(
  puzzle: Pick<QueensPuzzleView, 'size' | 'regions'>,
  queens: readonly number[]
): boolean {
  if (queens.length !== puzzle.size) return false
  return findConflicts(puzzle, queens).size === 0
}
