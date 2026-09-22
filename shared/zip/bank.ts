/**
 * The Zip puzzle bank and per-match selection.
 *
 * Every puzzle here is verified solvable (and, in fact, uniquely solvable) by
 * `bank.test.ts`, which runs the backtracking solver over the whole bank — so a
 * typo in a wall or checkpoint can never ship an unsolvable race. Puzzles were
 * produced by a dev-time generator that builds a random Hamiltonian path, drops
 * checkpoints along it, and adds only off-path walls; the checked-in data below
 * is the ground truth.
 *
 * Selection is server-side and seeded, so it cannot be influenced by clients.
 */
import type { ZipDifficulty, ZipPuzzle } from './puzzles'

export const PUZZLE_BANK: ZipPuzzle[] = [
  {
    id: 'e1',
    rows: 5,
    cols: 5,
    difficulty: 'easy',
    checkpoints: { 2: 1, 16: 2, 20: 3, 4: 4 },
    walls: [
      [3, 4],
      [6, 7],
      [18, 19]
    ]
  },
  {
    id: 'e2',
    rows: 5,
    cols: 5,
    difficulty: 'easy',
    checkpoints: { 24: 1, 6: 2, 10: 3, 8: 4 },
    walls: [
      [8, 13],
      [22, 23],
      [3, 8]
    ]
  },
  {
    id: 'm1',
    rows: 6,
    cols: 6,
    difficulty: 'medium',
    checkpoints: { 21: 1, 6: 2, 9: 3, 22: 4, 33: 5, 18: 6 },
    walls: [
      [19, 25],
      [10, 16],
      [13, 14],
      [10, 11],
      [31, 32],
      [28, 29]
    ]
  },
  {
    id: 'm2',
    rows: 6,
    cols: 6,
    difficulty: 'medium',
    checkpoints: { 12: 1, 3: 2, 14: 3, 25: 4, 35: 5, 5: 6 },
    walls: [
      [8, 14],
      [12, 18],
      [19, 25],
      [10, 11],
      [17, 23],
      [19, 20]
    ]
  },
  {
    id: 'h1',
    rows: 6,
    cols: 7,
    difficulty: 'hard',
    checkpoints: { 2: 1, 26: 2, 4: 3, 34: 4, 23: 5, 1: 6, 35: 7, 41: 8 },
    walls: [
      [24, 25],
      [19, 20],
      [30, 37],
      [14, 15],
      [28, 29],
      [7, 8],
      [2, 3],
      [21, 22],
      [33, 40]
    ]
  },
  {
    id: 'h2',
    rows: 6,
    cols: 7,
    difficulty: 'hard',
    checkpoints: { 2: 1, 32: 2, 22: 3, 14: 4, 29: 5, 41: 6, 19: 7, 3: 8 },
    walls: [
      [14, 15],
      [4, 11],
      [10, 17],
      [2, 3],
      [32, 33],
      [28, 29],
      [27, 34],
      [32, 39],
      [9, 16]
    ]
  }
]

export function getPuzzle(id: string): ZipPuzzle | undefined {
  return PUZZLE_BANK.find((p) => p.id === id)
}

/** The three rounds always escalate in difficulty. */
const ROUND_DIFFICULTIES: readonly ZipDifficulty[] = ['easy', 'medium', 'hard']

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]
}

/**
 * Choose the three puzzles for a match: one easy, one medium, one hard (in that
 * order, so rounds get harder). Every player in the match plays these same three
 * puzzles. Falls back gracefully if a tier is ever empty. `rng` is injectable so
 * tests are deterministic; the server passes `Math.random`.
 */
export function selectMatchPuzzles(rng: () => number = Math.random): string[] {
  const used = new Set<string>()
  const chosen: string[] = []
  for (const difficulty of ROUND_DIFFICULTIES) {
    const tier = PUZZLE_BANK.filter((p) => p.difficulty === difficulty && !used.has(p.id))
    const pool = tier.length > 0 ? tier : PUZZLE_BANK.filter((p) => !used.has(p.id))
    const puzzle = pick(pool.length > 0 ? pool : PUZZLE_BANK, rng)
    used.add(puzzle.id)
    chosen.push(puzzle.id)
  }
  return chosen
}
