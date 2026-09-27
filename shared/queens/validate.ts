/**
 * Queens solution validation — the authoritative rule check the server runs on a
 * submitted placement. Pure and deterministic; the client may run the same check
 * (and {@link findConflicts}) for instant feedback, but the server's verdict is
 * the only one that counts (see `engine.ts`).
 *
 * A placement is a set of queen cell indices. It is valid iff it:
 *   1. contains exactly `size` queens,
 *   2. has every queen in range with no duplicate cells,
 *   3. has exactly one queen per row,
 *   4. has exactly one queen per column,
 *   5. has exactly one queen per region,
 *   6. has no two queens touching (orthogonally or diagonally).
 *
 * Note validation is purely rule-based: it never consults the puzzle's stored
 * solution, so the server can check submissions without revealing the answer.
 */
import {
  areTouching,
  cellCount,
  cellRowCol,
  regionOf,
  type QueensPuzzle
} from './puzzles'

export type QueensInvalidReason =
  | 'WRONG_COUNT'
  | 'OUT_OF_BOUNDS'
  | 'DUPLICATE_CELL'
  | 'ROW_CONFLICT'
  | 'COLUMN_CONFLICT'
  | 'REGION_CONFLICT'
  | 'ADJACENT'

export type QueensValidation = { ok: true } | { ok: false; reason: QueensInvalidReason }

/**
 * Fully validate a completed placement against a puzzle. Returns the first rule
 * it violates so callers can surface precise feedback. Order of checks is chosen
 * so the most fundamental structural problems report first.
 */
export function validateQueens(puzzle: QueensPuzzle, queens: readonly number[]): QueensValidation {
  const { size } = puzzle
  const total = cellCount(puzzle)

  // 1. Exactly one queen per row ⇒ exactly `size` queens overall.
  if (queens.length !== size) return { ok: false, reason: 'WRONG_COUNT' }

  const seen = new Set<number>()
  const rows = new Set<number>()
  const cols = new Set<number>()
  const regions = new Set<number>()

  for (const cell of queens) {
    // 2. In range, no duplicates.
    if (!Number.isInteger(cell) || cell < 0 || cell >= total) {
      return { ok: false, reason: 'OUT_OF_BOUNDS' }
    }
    if (seen.has(cell)) return { ok: false, reason: 'DUPLICATE_CELL' }
    seen.add(cell)

    const { row, col } = cellRowCol(cell, size)
    // 3/4. One per row / column.
    if (rows.has(row)) return { ok: false, reason: 'ROW_CONFLICT' }
    rows.add(row)
    if (cols.has(col)) return { ok: false, reason: 'COLUMN_CONFLICT' }
    cols.add(col)
    // 5. One per region.
    const region = regionOf(puzzle.regions, cell)
    if (regions.has(region)) return { ok: false, reason: 'REGION_CONFLICT' }
    regions.add(region)
  }

  // 6. No two queens touching (only need to compare distinct pairs).
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      if (areTouching(size, queens[i], queens[j])) return { ok: false, reason: 'ADJACENT' }
    }
  }

  return { ok: true }
}

/**
 * Which of the currently-placed queens are in conflict — for live UI feedback
 * only (the client highlights these red). A queen conflicts if it shares a row,
 * column or region with another placed queen, or touches one. Works on partial
 * placements (fewer than `size` queens), unlike {@link validateQueens}.
 */
export function findConflicts(
  puzzle: Pick<QueensPuzzle, 'size' | 'regions'>,
  queens: readonly number[]
): Set<number> {
  const { size } = puzzle
  const bad = new Set<number>()
  const byRow = new Map<number, number[]>()
  const byCol = new Map<number, number[]>()
  const byRegion = new Map<number, number[]>()

  const push = (map: Map<number, number[]>, key: number, cell: number) => {
    const arr = map.get(key)
    if (arr) arr.push(cell)
    else map.set(key, [cell])
  }

  for (const cell of queens) {
    const { row, col } = cellRowCol(cell, size)
    push(byRow, row, cell)
    push(byCol, col, cell)
    push(byRegion, regionOf(puzzle.regions, cell), cell)
  }
  for (const group of [byRow, byCol, byRegion]) {
    for (const cells of group.values()) {
      if (cells.length > 1) for (const c of cells) bad.add(c)
    }
  }
  // Adjacency (king move).
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      if (areTouching(size, queens[i], queens[j])) {
        bad.add(queens[i])
        bad.add(queens[j])
      }
    }
  }
  return bad
}

/**
 * Count valid full solutions of a puzzle, up to `cap`. Used to prefer uniquely
 * solvable puzzles during generation and to verify the bank. Places one queen
 * per row via backtracking, pruning on column/region reuse and adjacency to the
 * previously-placed (adjacent) row.
 */
export function countSolutions(
  puzzle: Pick<QueensPuzzle, 'size' | 'regions'>,
  cap = 2
): number {
  const { size, regions } = puzzle
  const usedCols = new Array<boolean>(size).fill(false)
  const usedRegions = new Array<boolean>(size).fill(false)
  const chosenCol = new Array<number>(size).fill(-1)
  let count = 0

  const dfs = (row: number) => {
    if (count >= cap) return
    if (row === size) {
      count++
      return
    }
    for (let col = 0; col < size && count < cap; col++) {
      if (usedCols[col]) continue
      const region = regions[row * size + col]
      if (usedRegions[region]) continue
      // Adjacency only matters against the immediately previous row (all other
      // placed rows are ≥2 rows away, so they can never touch).
      if (row > 0 && Math.abs(col - chosenCol[row - 1]) <= 1) continue
      usedCols[col] = true
      usedRegions[region] = true
      chosenCol[row] = col
      dfs(row + 1)
      usedCols[col] = false
      usedRegions[region] = false
      chosenCol[row] = -1
    }
  }
  dfs(0)
  return count
}

/**
 * Return one valid full solution for a puzzle, or null if none exists. Used to
 * verify bank puzzles are solvable. Same backtracking as {@link countSolutions}
 * but stops at the first solution and returns the queen cell indices.
 */
export function solveQueens(puzzle: Pick<QueensPuzzle, 'size' | 'regions'>): number[] | null {
  const { size, regions } = puzzle
  const usedCols = new Array<boolean>(size).fill(false)
  const usedRegions = new Array<boolean>(size).fill(false)
  const chosenCol = new Array<number>(size).fill(-1)

  const dfs = (row: number): boolean => {
    if (row === size) return true
    for (let col = 0; col < size; col++) {
      if (usedCols[col]) continue
      const region = regions[row * size + col]
      if (usedRegions[region]) continue
      if (row > 0 && Math.abs(col - chosenCol[row - 1]) <= 1) continue
      usedCols[col] = true
      usedRegions[region] = true
      chosenCol[row] = col
      if (dfs(row + 1)) return true
      usedCols[col] = false
      usedRegions[region] = false
      chosenCol[row] = -1
    }
    return false
  }
  if (!dfs(0)) return null
  return chosenCol.map((col, row) => row * size + col)
}
