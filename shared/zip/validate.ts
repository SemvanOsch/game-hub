/**
 * Zip path validation — the authoritative rule check the server runs on a
 * submitted solution. It is pure and deterministic; the client may run the same
 * check for instant feedback, but the server's verdict is the only one that
 * counts (see `engine.ts`).
 *
 * A path is an ordered list of cell indices. It is valid iff it:
 *   1. starts at checkpoint 1,
 *   2. ends at the highest-numbered checkpoint,
 *   3. moves only between orthogonally adjacent cells,
 *   4. never crosses a wall,
 *   5. visits every cell exactly once (no repeats, full coverage),
 *   6. visits the numbered checkpoints in ascending order (1,2,…,N),
 *   7. skips no checkpoint.
 */
import {
  areAdjacent,
  buildWallSet,
  cellCount,
  checkpointCell,
  checkpointCount,
  hasWall,
  neighbors,
  type ZipPuzzle
} from './puzzles'

export type ZipInvalidReason =
  | 'EMPTY'
  | 'BAD_START'
  | 'NOT_ADJACENT'
  | 'WALL'
  | 'REVISIT'
  | 'CHECKPOINT_ORDER'
  | 'BAD_END'
  | 'INCOMPLETE'

export type ZipValidation = { ok: true } | { ok: false; reason: ZipInvalidReason }

/**
 * Fully validate a completed path against a puzzle. Returns the first rule it
 * violates so callers can surface precise feedback.
 */
export function validatePath(puzzle: ZipPuzzle, path: readonly number[]): ZipValidation {
  const total = cellCount(puzzle)
  const n = checkpointCount(puzzle)
  if (path.length === 0) return { ok: false, reason: 'EMPTY' }

  // 1. Start at checkpoint 1.
  if (path[0] !== checkpointCell(puzzle, 1)) return { ok: false, reason: 'BAD_START' }

  const walls = buildWallSet(puzzle)
  const seen = new Set<number>()
  let expectedCheckpoint = 1

  for (let i = 0; i < path.length; i++) {
    const cell = path[i]
    // In-range guard (indices outside the grid can never be adjacent, but be
    // explicit so malformed input is rejected as a revisit-free bad cell).
    if (cell < 0 || cell >= total) return { ok: false, reason: 'REVISIT' }
    // 5a. No cell twice.
    if (seen.has(cell)) return { ok: false, reason: 'REVISIT' }
    seen.add(cell)

    if (i > 0) {
      const prev = path[i - 1]
      // 3. Orthogonally adjacent.
      if (!areAdjacent(puzzle, prev, cell)) return { ok: false, reason: 'NOT_ADJACENT' }
      // 4. No wall between the two cells.
      if (hasWall(walls, prev, cell)) return { ok: false, reason: 'WALL' }
    }

    // 6 & 7. Numbered cells must appear in ascending order with none skipped.
    const number = puzzle.checkpoints[cell]
    if (number !== undefined) {
      if (number !== expectedCheckpoint) return { ok: false, reason: 'CHECKPOINT_ORDER' }
      expectedCheckpoint++
    }
  }

  // 5b. Every cell covered exactly once.
  if (seen.size !== total) return { ok: false, reason: 'INCOMPLETE' }
  // 7. All checkpoints reached.
  if (expectedCheckpoint !== n + 1) return { ok: false, reason: 'CHECKPOINT_ORDER' }
  // 2. End at the highest checkpoint.
  if (path[path.length - 1] !== checkpointCell(puzzle, n)) return { ok: false, reason: 'BAD_END' }

  return { ok: true }
}

/**
 * Backtracking solver: returns one valid full path for the puzzle, or null if
 * none exists. Used to guarantee every bank puzzle is solvable (see the tests);
 * not on any hot path. Explores from checkpoint 1, pruning branches that reach a
 * numbered cell out of order.
 */
export function solvePuzzle(puzzle: ZipPuzzle): number[] | null {
  const total = cellCount(puzzle)
  const n = checkpointCount(puzzle)
  const start = checkpointCell(puzzle, 1)
  const end = checkpointCell(puzzle, n)
  if (start < 0 || end < 0) return null

  const walls = buildWallSet(puzzle)
  const adj = Array.from({ length: total }, (_, i) => neighbors(puzzle, walls, i))
  const visited = new Array<boolean>(total).fill(false)
  const path: number[] = []

  // Count how many still-unvisited neighbours a cell has (Warnsdorff heuristic
  // + dead-end pruning). Both keep the exhaustive search correct while pruning
  // branches that could never complete a Hamiltonian path.
  const freeDegree = (cell: number): number => {
    let d = 0
    for (const nb of adj[cell]) if (!visited[nb]) d++
    return d
  }

  const dfs = (cell: number, nextCheckpoint: number): boolean => {
    const number = puzzle.checkpoints[cell]
    if (number !== undefined) {
      // Reaching a numbered cell out of turn is a dead end.
      if (number !== nextCheckpoint) return false
      nextCheckpoint++
    }
    visited[cell] = true
    path.push(cell)

    if (path.length === total) {
      // Full coverage: valid only if we finished on the last checkpoint and hit
      // every checkpoint along the way.
      if (cell === end && nextCheckpoint === n + 1) {
        return true
      }
    } else {
      // Prune: any unvisited cell other than our current head and the target end
      // that has no unvisited neighbours can never be reached — abandon early.
      let deadEnd = false
      for (let i = 0; i < total && !deadEnd; i++) {
        if (!visited[i] && i !== end && freeDegree(i) === 0) deadEnd = true
      }
      if (!deadEnd) {
        // Explore neighbours with the fewest onward options first (Warnsdorff).
        const candidates = adj[cell]
          .filter((nb) => !visited[nb])
          .sort((a, b) => freeDegree(a) - freeDegree(b))
        for (const next of candidates) {
          if (dfs(next, nextCheckpoint)) return true
        }
      }
    }

    visited[cell] = false
    path.pop()
    return false
  }

  return dfs(start, 1) ? [...path] : null
}
