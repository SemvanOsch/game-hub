/**
 * Procedural Queens puzzle generation, used both live (the server generates a
 * fresh set of three puzzles when a match starts) and by the dev script that
 * fills the static bank. Pure and deterministic given an RNG.
 *
 * Method (guarantees solvability by construction):
 *   1. Build a random *valid* queen arrangement — one queen per row and column
 *      with no two touching. This becomes the puzzle's canonical `solution`.
 *   2. Seed one region at each queen, then flood-grow the regions into adjacent
 *      unassigned cells until the whole grid is partitioned. Every region is
 *      contiguous and contains exactly its one seed queen, so the arrangement
 *      from step 1 is always a valid solution of the finished puzzle.
 *   3. Prefer layouts whose solution is unique (a tighter, fairer race), keeping
 *      the least-ambiguous candidate as a fallback so generation never fails.
 */
import { cellIndex, cellRowCol, type QueensDifficulty, type QueensPuzzle } from './puzzles'
import { countSolutions } from './validate'
import { PUZZLE_BANK } from './bank'

export interface TierSpec {
  difficulty: QueensDifficulty
  size: number
}

/** The three difficulty tiers a match escalates through (round 1 → 2 → 3). */
export const MATCH_TIERS: TierSpec[] = [
  { difficulty: 'easy', size: 6 },
  { difficulty: 'medium', size: 7 },
  { difficulty: 'hard', size: 8 }
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

/**
 * A random valid queen arrangement for an N×N grid: a permutation of columns
 * (one queen per row and column) where consecutive rows differ by ≥2 columns, so
 * no two queens touch. Returns queen cell indices ordered by row, or null if a
 * bounded randomized search can't place them (only tight for very small N).
 */
export function generateSolution(size: number, rand: () => number): number[] | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const cols = new Array<number>(size).fill(-1)
    const usedCol = new Array<boolean>(size).fill(false)

    const place = (row: number): boolean => {
      if (row === size) return true
      for (const col of shuffle(
        Array.from({ length: size }, (_, c) => c),
        rand
      )) {
        if (usedCol[col]) continue
        if (row > 0 && Math.abs(col - cols[row - 1]) <= 1) continue
        cols[row] = col
        usedCol[col] = true
        if (place(row + 1)) return true
        cols[row] = -1
        usedCol[col] = false
      }
      return false
    }
    if (place(0)) return cols.map((c, r) => cellIndex(r, c, size))
  }
  return null
}

/** Orthogonal grid neighbours of a cell (no wall concept in Queens). */
function gridNeighbors(size: number, index: number): number[] {
  const { row, col } = cellRowCol(index, size)
  const out: number[] = []
  if (row > 0) out.push(cellIndex(row - 1, col, size))
  if (row < size - 1) out.push(cellIndex(row + 1, col, size))
  if (col > 0) out.push(cellIndex(row, col - 1, size))
  if (col < size - 1) out.push(cellIndex(row, col + 1, size))
  return out
}

/**
 * Flood-grow contiguous regions from the seed queens until every cell is
 * assigned. At each step a random cell on the frontier (unassigned but adjacent
 * to an assigned cell) is absorbed into that neighbour's region — so regions stay
 * connected and each keeps exactly its one seed queen.
 */
function growRegions(size: number, solution: number[], rand: () => number): number[] {
  const total = size * size
  const regions = new Array<number>(total).fill(-1)
  solution.forEach((cell, region) => (regions[cell] = region))

  // Frontier: unassigned cells adjacent to some assigned cell.
  let frontier = new Set<number>()
  for (const cell of solution) {
    for (const nb of gridNeighbors(size, cell)) if (regions[nb] === -1) frontier.add(nb)
  }

  while (frontier.size > 0) {
    const candidates = shuffle([...frontier], rand)
    const cell = candidates[0]
    frontier.delete(cell)
    if (regions[cell] !== -1) continue
    // Adopt a random assigned neighbour's region.
    const assignedNbs = gridNeighbors(size, cell).filter((nb) => regions[nb] !== -1)
    if (assignedNbs.length === 0) continue
    const source = shuffle(assignedNbs, rand)[0]
    regions[cell] = regions[source]
    for (const nb of gridNeighbors(size, cell)) if (regions[nb] === -1) frontier.add(nb)
  }
  return regions
}

export interface GenerateOptions {
  /**
   * When true, keep searching for a puzzle with a *unique* solution (a tighter,
   * fairer race). Both live and bank generation use this; the difference is the
   * attempt budget. Every candidate is solvable by construction, so if no unique
   * layout is found the least-ambiguous candidate is returned as a fallback.
   */
  preferUnique?: boolean
  /** Max candidate layouts to try. */
  attempts?: number
}

/**
 * Generate one verified (always solvable) puzzle for a tier, or null only if a
 * valid queen arrangement can't be built (never for the tiers we ship).
 */
export function generatePuzzle(
  spec: TierSpec,
  id: string,
  rand: () => number,
  opts: GenerateOptions = {}
): QueensPuzzle | null {
  const attempts = opts.attempts ?? (opts.preferUnique ? 40 : 12)
  const preferUnique = opts.preferUnique ?? true
  let best: QueensPuzzle | null = null
  let bestSolutions = Infinity

  for (let attempt = 0; attempt < attempts; attempt++) {
    const solution = generateSolution(spec.size, rand)
    if (!solution) continue
    const regions = growRegions(spec.size, solution, rand)
    const puzzle: QueensPuzzle = {
      id,
      size: spec.size,
      regions,
      solution: [...solution].sort((a, b) => a - b),
      difficulty: spec.difficulty
    }
    if (!preferUnique) return puzzle
    const n = countSolutions(puzzle, 2)
    if (n === 1) return puzzle // unique — ideal
    if (n < bestSolutions) {
      bestSolutions = n
      best = puzzle
    }
  }
  return best
}

/**
 * Generate the three puzzles for a match — one easy, one medium, one hard, in
 * that order. Falls back to a bank puzzle of the right difficulty if procedural
 * generation ever fails, so a match can always start. Deterministic given `rng`.
 */
export function generateMatchPuzzles(rng: () => number): QueensPuzzle[] {
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
