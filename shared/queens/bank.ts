/**
 * The Queens puzzle bank — a safety net of pre-verified puzzles.
 *
 * Live matches generate their three puzzles procedurally (see `generate.ts`), and
 * that generation always succeeds because every candidate is solvable by
 * construction. This bank is only the fallback `generateMatchPuzzles` reaches for
 * if generation ever returns null, so a match can always start.
 *
 * Every puzzle here is verified uniquely solvable by `bank.test.ts`, which runs
 * the backtracking solver/counter over the whole bank — so a typo in a region map
 * can never ship an unsolvable race. The data was produced by the dev-time
 * generator (a random valid arrangement + flood-grown regions); the checked-in
 * data below is the ground truth.
 */
import type { QueensPuzzle } from './puzzles'

export const PUZZLE_BANK: QueensPuzzle[] = [
  {
    id: 'e1',
    size: 6,
    difficulty: 'easy',
    regions: [1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 3, 1, 1, 0, 0, 2, 3, 5, 4, 4, 4, 4, 3, 5, 4, 4, 4, 4, 5, 5, 4, 4, 4, 4],
    solution: [4, 8, 17, 18, 27, 31]
  },
  {
    id: 'e2',
    size: 6,
    difficulty: 'easy',
    regions: [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 5, 3, 1, 1, 2, 5, 5, 3, 4, 4, 5, 5, 5, 3, 3, 5, 5, 5, 5],
    solution: [5, 7, 15, 18, 26, 34]
  },
  {
    id: 'm1',
    size: 7,
    difficulty: 'medium',
    regions: [0, 0, 0, 1, 1, 1, 1, 2, 0, 1, 1, 1, 1, 1, 2, 0, 3, 5, 4, 4, 4, 5, 5, 3, 5, 5, 4, 4, 5, 5, 5, 5, 5, 4, 4, 5, 5, 5, 5, 5, 4, 4, 5, 5, 5, 5, 6, 6, 4],
    solution: [1, 11, 14, 23, 34, 38, 47]
  },
  {
    id: 'm2',
    size: 7,
    difficulty: 'medium',
    regions: [1, 0, 0, 5, 5, 2, 2, 1, 5, 5, 5, 2, 2, 2, 3, 3, 5, 5, 2, 2, 4, 3, 3, 3, 5, 5, 2, 4, 3, 3, 5, 5, 4, 4, 4, 3, 5, 5, 5, 5, 4, 4, 3, 5, 5, 5, 5, 4, 6],
    solution: [2, 7, 18, 22, 33, 38, 48]
  },
  {
    id: 'h1',
    size: 8,
    difficulty: 'hard',
    regions: [2, 0, 4, 4, 1, 1, 1, 1, 2, 2, 4, 4, 4, 3, 3, 1, 2, 2, 4, 4, 4, 3, 3, 1, 2, 2, 4, 4, 4, 3, 3, 3, 4, 4, 4, 4, 4, 4, 3, 3, 6, 6, 6, 6, 4, 5, 3, 3, 6, 6, 6, 6, 7, 7, 3, 3, 6, 6, 6, 6, 7, 7, 7, 7],
    solution: [1, 15, 16, 30, 35, 45, 50, 60]
  },
  {
    id: 'h2',
    size: 8,
    difficulty: 'hard',
    regions: [2, 2, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 3, 2, 2, 2, 2, 1, 1, 3, 3, 2, 2, 2, 2, 5, 4, 3, 3, 2, 2, 5, 5, 5, 4, 4, 4, 2, 6, 6, 5, 5, 7, 7, 4, 2, 6, 6, 6, 7, 7, 7, 7],
    solution: [2, 14, 16, 31, 37, 43, 49, 60]
  }
]

export function getPuzzle(id: string): QueensPuzzle | undefined {
  return PUZZLE_BANK.find((p) => p.id === id)
}
