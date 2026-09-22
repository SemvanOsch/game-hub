/**
 * Procedural Zip puzzle generation, used both live (the server generates a fresh
 * set of three puzzles when a match starts) and by the dev script that fills the
 * static bank. Pure and deterministic given an RNG.
 *
 * Method: build a random Hamiltonian path over the grid (which guarantees a
 * solution exists), drop the checkpoints along that path, then add only walls
 * that sit *off* the path (so they can never break the guaranteed solution).
 * Each candidate is re-checked with the real solver, and puzzles with a unique
 * (or near-unique) solution are preferred so the race is tight and fair.
 */
import {
  buildWallSet,
  cellIndex,
  cellRowCol,
  neighbors,
  type ZipDifficulty,
  type ZipPuzzle
} from './puzzles'
import { solvePuzzle, validatePath } from './validate'
import { PUZZLE_BANK } from './bank'

export interface TierSpec {
  difficulty: ZipDifficulty
  rows: number
  cols: number
  /** Number of numbered checkpoints (including start=1 and end=N). */
  checkpoints: number
  /** How many off-path walls to add. */
  walls: number
}

/** The three difficulty tiers a match escalates through (round 1 → 2 → 3). */
export const MATCH_TIERS: TierSpec[] = [
  { difficulty: 'easy', rows: 5, cols: 5, checkpoints: 4, walls: 3 },
  { difficulty: 'medium', rows: 6, cols: 6, checkpoints: 6, walls: 6 },
  { difficulty: 'hard', rows: 6, cols: 7, checkpoints: 8, walls: 9 }
]

/** Deterministic mulberry32 RNG from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function gridNeighbors(rows: number, cols: number, index: number): number[] {
  const { row, col } = cellRowCol(index, cols)
  const out: number[] = []
  if (row > 0) out.push(cellIndex(row - 1, col, cols))
  if (row < rows - 1) out.push(cellIndex(row + 1, col, cols))
  if (col > 0) out.push(cellIndex(row, col - 1, cols))
  if (col < cols - 1) out.push(cellIndex(row, col + 1, cols))
  return out
}

/**
 * Random Hamiltonian path via backtracking DFS, ordered by the Warnsdorff
 * heuristic (step to the neighbour with the fewest onward moves first) with
 * random tie-breaks. The heuristic makes finding a full-coverage path close to
 * linear in practice, while random starts + tie-breaks keep the paths varied.
 */
function hamiltonian(rows: number, cols: number, rand: () => number): number[] | null {
  const total = rows * cols
  const adj = Array.from({ length: total }, (_, i) => gridNeighbors(rows, cols, i))

  for (let attempt = 0; attempt < 40; attempt++) {
    const start = Math.floor(rand() * total)
    const visited = new Array<boolean>(total).fill(false)
    const path: number[] = []

    const freeDegree = (cell: number): number => {
      let d = 0
      for (const nb of adj[cell]) if (!visited[nb]) d++
      return d
    }

    // Order unvisited neighbours by onward degree (asc), random within a tier.
    const orderedNext = (cell: number): number[] =>
      shuffle(
        adj[cell].filter((nb) => !visited[nb]),
        rand
      ).sort((a, b) => freeDegree(a) - freeDegree(b))

    const stack: Array<{ cell: number; opts: number[] }> = []
    visited[start] = true
    path.push(start)
    stack.push({ cell: start, opts: orderedNext(start) })

    while (path.length < total && stack.length) {
      const top = stack[stack.length - 1]
      let advanced = false
      while (top.opts.length) {
        const next = top.opts.shift()!
        if (!visited[next]) {
          visited[next] = true
          path.push(next)
          stack.push({ cell: next, opts: orderedNext(next) })
          advanced = true
          break
        }
      }
      if (!advanced) {
        visited[top.cell] = false
        path.pop()
        stack.pop()
      }
    }
    if (path.length === total) return path
  }
  return null
}

/** Count solutions up to `cap` (to prefer unique/tightly-constrained puzzles). */
function countSolutions(puzzle: ZipPuzzle, cap = 3): number {
  const total = puzzle.rows * puzzle.cols
  const n = Math.max(...Object.values(puzzle.checkpoints))
  const cellOf = (num: number) =>
    Number(Object.entries(puzzle.checkpoints).find(([, v]) => v === num)![0])
  const start = cellOf(1)
  const end = cellOf(n)
  const walls = buildWallSet(puzzle)
  const visited = new Array<boolean>(total).fill(false)
  let count = 0
  const dfs = (cell: number, nextCp: number, len: number) => {
    if (count >= cap) return
    const num = puzzle.checkpoints[cell]
    let nc = nextCp
    if (num !== undefined) {
      if (num !== nextCp) return
      nc++
    }
    visited[cell] = true
    if (len === total) {
      if (cell === end && nc === n + 1) count++
    } else {
      for (const nb of neighbors(puzzle, walls, cell)) if (!visited[nb]) dfs(nb, nc, len + 1)
    }
    visited[cell] = false
  }
  dfs(start, 1, 1)
  return count
}

/** Build a puzzle from a path: checkpoints spread along it, walls off it. */
function buildFromPath(spec: TierSpec, id: string, path: number[], rand: () => number): ZipPuzzle {
  const total = spec.rows * spec.cols
  const checkpoints: Record<number, number> = {}
  const cp = Math.max(2, spec.checkpoints)
  for (let k = 0; k < cp; k++) {
    const pos = k === cp - 1 ? total - 1 : Math.round((k * (total - 1)) / (cp - 1))
    checkpoints[path[pos]] = k + 1
  }
  const pathEdges = new Set<string>()
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    pathEdges.add(a < b ? `${a}|${b}` : `${b}|${a}`)
  }
  const candidates: Array<[number, number]> = []
  for (let i = 0; i < total; i++) {
    for (const nb of gridNeighbors(spec.rows, spec.cols, i)) {
      if (i < nb && !pathEdges.has(`${i}|${nb}`)) candidates.push([i, nb])
    }
  }
  const walls = shuffle(candidates, rand).slice(0, Math.min(spec.walls, candidates.length))
  return { id, rows: spec.rows, cols: spec.cols, difficulty: spec.difficulty, checkpoints, walls }
}

export interface GenerateOptions {
  /**
   * When true, keep searching for a puzzle with a unique (≤ 2) solution. This is
   * thorough but slow (proving uniqueness explores the whole solution space), so
   * it's for offline bank generation. Live generation leaves it off and accepts
   * the first solvable puzzle — a race is fair as long as everyone gets the same
   * solvable grid, and a solvability check stops at the first solution (fast).
   */
  preferUnique?: boolean
  /** Max candidate puzzles to try before giving up. */
  attempts?: number
}

/**
 * Generate one verified (always solvable) puzzle for a tier, or null if a
 * bounded search can't. See {@link GenerateOptions} for the fast/thorough knob.
 */
export function generatePuzzle(
  spec: TierSpec,
  id: string,
  rand: () => number,
  opts: GenerateOptions = {}
): ZipPuzzle | null {
  const attempts = opts.attempts ?? (opts.preferUnique ? 20 : 8)
  let fallback: ZipPuzzle | null = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    const path = hamiltonian(spec.rows, spec.cols, rand)
    if (!path) continue
    const puzzle = buildFromPath(spec, id, path, rand)
    const solution = solvePuzzle(puzzle)
    if (!solution || !validatePath(puzzle, solution).ok) continue
    if (!opts.preferUnique) return puzzle // first solvable — fast path (live)
    fallback ??= puzzle
    if (countSolutions(puzzle, 3) <= 2) return puzzle
  }
  return fallback
}

/**
 * Generate the three puzzles for a match — one easy, one medium, one hard, in
 * that order. Falls back to a bank puzzle of the right difficulty if procedural
 * generation ever fails, so a match can always start. Deterministic given `rng`.
 */
export function generateMatchPuzzles(rng: () => number): ZipPuzzle[] {
  return MATCH_TIERS.map((spec, i) => {
    const id = `r${i + 1}`
    const generated = generatePuzzle(spec, id, rng)
    if (generated) return generated
    // Fallback: reuse a verified bank puzzle of this difficulty.
    const pool = PUZZLE_BANK.filter((p) => p.difficulty === spec.difficulty)
    const chosen = pool[Math.floor(rng() * pool.length)] ?? PUZZLE_BANK[0]
    return { ...chosen, id }
  })
}
