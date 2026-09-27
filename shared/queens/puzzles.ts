/**
 * Queens puzzle model + shared geometry helpers.
 *
 * A Queens puzzle is an N×N grid partitioned into N contiguous colour regions.
 * The solver must place N queens so that there is exactly one queen in every
 * row, every column and every region, and no two queens touch — orthogonally or
 * diagonally. (This is the LinkedIn "Queens" ruleset: unlike classic chess
 * N-queens, two queens may share a diagonal as long as they are not *adjacent*.)
 *
 * Cells are addressed by a single index `i = row * size + col`. Regions are a
 * flat array of length `size*size`, one region id (0..size-1) per cell.
 *
 * The `solution` (a canonical valid placement) is retained **server-side only**
 * — it is used to guarantee generated puzzles are solvable and to measure
 * uniqueness. Clients receive a {@link QueensPuzzleView} which omits it, so a
 * modified client can never read the answer off the wire (validation is
 * rule-based, so the server needs no stored solution to check a submission).
 *
 * This module is pure and isomorphic (no Node/DOM): both the server (validation,
 * generation) and the renderer (drawing) import it. Grid size is never assumed
 * constant — every helper derives dimensions from the puzzle itself.
 */

export type QueensDifficulty = 'easy' | 'medium' | 'hard'

/** Authoritative puzzle, including the server-only solution. */
export interface QueensPuzzle {
  /** Stable id, unique within a match/bank. */
  id: string
  /** Grid is `size` × `size`, with `size` queens / regions. */
  size: number
  /** Region id (0..size-1) for each cell, indexed by cell index. */
  regions: number[]
  /**
   * A canonical valid placement (one queen cell index per region). SERVER-ONLY —
   * never included in {@link QueensPuzzleView}. Present so generation can verify
   * solvability/uniqueness; the running rules never compare against it.
   */
  solution: number[]
  difficulty: QueensDifficulty
}

/** The puzzle as sent to clients: everything needed to play, but no solution. */
export interface QueensPuzzleView {
  id: string
  size: number
  regions: number[]
  difficulty: QueensDifficulty
}

/** Strip the server-only solution, producing the client-safe puzzle view. */
export function toPuzzleView(puzzle: QueensPuzzle): QueensPuzzleView {
  return {
    id: puzzle.id,
    size: puzzle.size,
    regions: puzzle.regions,
    difficulty: puzzle.difficulty
  }
}

/** Cell index from row/column for a grid of the given width. */
export function cellIndex(row: number, col: number, size: number): number {
  return row * size + col
}

/** Row/column for a cell index in a grid of the given width. */
export function cellRowCol(index: number, size: number): { row: number; col: number } {
  return { row: Math.floor(index / size), col: index % size }
}

export function cellCount(puzzle: Pick<QueensPuzzle, 'size'>): number {
  return puzzle.size * puzzle.size
}

/** The region id of a cell, or -1 if out of range. */
export function regionOf(regions: readonly number[], index: number): number {
  return index >= 0 && index < regions.length ? regions[index] : -1
}

/**
 * Whether two cells touch — orthogonally *or* diagonally (a king move). Queens
 * may not be placed on touching cells.
 */
export function areTouching(size: number, a: number, b: number): boolean {
  if (a === b) return false
  const pa = cellRowCol(a, size)
  const pb = cellRowCol(b, size)
  return Math.abs(pa.row - pb.row) <= 1 && Math.abs(pa.col - pb.col) <= 1
}
