import { describe, it, expect } from 'vitest'
import { MATCH_TIERS, generateMatchPuzzles, mulberry32 } from './generate'
import { checkpointCount } from './puzzles'
import { solvePuzzle, validatePath } from './validate'

describe('generateMatchPuzzles', () => {
  it('produces one solvable puzzle per difficulty tier, in order', () => {
    const puzzles = generateMatchPuzzles(mulberry32(12345))
    expect(puzzles).toHaveLength(3)
    expect(puzzles.map((p) => p.difficulty)).toEqual(MATCH_TIERS.map((t) => t.difficulty))
    for (const puzzle of puzzles) {
      const solution = solvePuzzle(puzzle)
      expect(solution, `generated ${puzzle.id} solvable`).not.toBeNull()
      expect(validatePath(puzzle, solution!).ok).toBe(true)
      // Checkpoints are the consecutive integers 1..N.
      const numbers = Object.values(puzzle.checkpoints).sort((a, b) => a - b)
      expect(numbers).toEqual(Array.from({ length: checkpointCount(puzzle) }, (_, i) => i + 1))
    }
  })

  it('is deterministic for a given seed and varies across seeds', () => {
    expect(generateMatchPuzzles(mulberry32(7))).toEqual(generateMatchPuzzles(mulberry32(7)))
    expect(generateMatchPuzzles(mulberry32(7))).not.toEqual(generateMatchPuzzles(mulberry32(8)))
  })

  it('matches the grid sizes configured per tier', () => {
    const puzzles = generateMatchPuzzles(mulberry32(999))
    puzzles.forEach((p, i) => {
      expect(p.rows).toBe(MATCH_TIERS[i].rows)
      expect(p.cols).toBe(MATCH_TIERS[i].cols)
    })
  })
})
