/**
 * Zip puzzle model + the shared puzzle bank.
 *
 * A Zip puzzle is a rectangular grid with numbered checkpoints and optional
 * walls between orthogonally adjacent cells. The player must draw one continuous
 * path that starts at checkpoint 1, ends at the highest-numbered checkpoint,
 * moves only between adjacent cells (never across a wall), visits the numbered
 * checkpoints in ascending order, and fills every cell exactly once.
 *
 * Cells are addressed by a single index `i = row * cols + col`. Walls are stored
 * as unordered pairs of adjacent cell indices (normalised so the smaller index
 * comes first) — a wall forbids the path from stepping directly between them.
 *
 * This module is pure and isomorphic (no Node/DOM): both the server (validation,
 * selection) and the renderer (drawing) import it. Grid size is not assumed to
 * be constant — every helper derives dimensions from the puzzle itself.
 */

export type ZipDifficulty = 'easy' | 'medium' | 'hard'

export interface ZipPuzzle {
  /** Stable id, unique within the bank. */
  id: string
  rows: number
  cols: number
  /**
   * Numbered checkpoints as `cellIndex -> checkpoint number`. Numbers are the
   * consecutive integers 1..N (N = number of checkpoints); 1 is the start and N
   * the required end of the path.
   */
  checkpoints: Record<number, number>
  /** Walls between adjacent cells, each `[a, b]` with `a < b`. */
  walls: Array<[number, number]>
  difficulty: ZipDifficulty
}

/** Cell index from row/column for a given grid width. */
export function cellIndex(row: number, col: number, cols: number): number {
  return row * cols + col
}

/** Row/column for a cell index in a grid of the given width. */
export function cellRowCol(index: number, cols: number): { row: number; col: number } {
  return { row: Math.floor(index / cols), col: index % cols }
}

export function cellCount(puzzle: Pick<ZipPuzzle, 'rows' | 'cols'>): number {
  return puzzle.rows * puzzle.cols
}

/** Normalised wall key so lookups are order-independent. */
function wallKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Precomputed lookup set of a puzzle's walls, for O(1) `hasWall` checks. */
export function buildWallSet(puzzle: Pick<ZipPuzzle, 'walls'>): Set<string> {
  const set = new Set<string>()
  for (const [a, b] of puzzle.walls) set.add(wallKey(a, b))
  return set
}

/** Whether a wall sits between two cell indices (order-independent). */
export function hasWall(walls: Set<string>, a: number, b: number): boolean {
  return walls.has(wallKey(a, b))
}

/**
 * The orthogonal neighbours of a cell that are reachable in one step: on the
 * grid and not separated by a wall.
 */
export function neighbors(
  puzzle: Pick<ZipPuzzle, 'rows' | 'cols'>,
  walls: Set<string>,
  index: number
): number[] {
  const { row, col } = cellRowCol(index, puzzle.cols)
  const out: number[] = []
  const push = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= puzzle.rows || c >= puzzle.cols) return
    const n = cellIndex(r, c, puzzle.cols)
    if (!hasWall(walls, index, n)) out.push(n)
  }
  push(row - 1, col)
  push(row + 1, col)
  push(row, col - 1)
  push(row, col + 1)
  return out
}

/** Whether two cells are orthogonally adjacent on the grid (ignores walls). */
export function areAdjacent(
  puzzle: Pick<ZipPuzzle, 'rows' | 'cols'>,
  a: number,
  b: number
): boolean {
  const pa = cellRowCol(a, puzzle.cols)
  const pb = cellRowCol(b, puzzle.cols)
  const dr = Math.abs(pa.row - pb.row)
  const dc = Math.abs(pa.col - pb.col)
  return dr + dc === 1
}

/** The number of checkpoints in a puzzle (== the highest checkpoint number). */
export function checkpointCount(puzzle: Pick<ZipPuzzle, 'checkpoints'>): number {
  const values = Object.values(puzzle.checkpoints)
  return values.length === 0 ? 0 : Math.max(...values)
}

/** Cell index of a given checkpoint number, or -1 if absent. */
export function checkpointCell(puzzle: Pick<ZipPuzzle, 'checkpoints'>, number: number): number {
  for (const [idx, n] of Object.entries(puzzle.checkpoints)) {
    if (n === number) return Number(idx)
  }
  return -1
}
