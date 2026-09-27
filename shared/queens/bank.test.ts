import { describe, it, expect } from 'vitest'
import { PUZZLE_BANK, getPuzzle } from './bank'
import { countSolutions, solveQueens, validateQueens } from './validate'

describe('Queens puzzle bank', () => {
  it('has puzzles for every difficulty', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      expect(PUZZLE_BANK.some((p) => p.difficulty === difficulty)).toBe(true)
    }
  })

  it('every bank puzzle is well-formed', () => {
    for (const p of PUZZLE_BANK) {
      expect(p.regions).toHaveLength(p.size * p.size)
      // Regions are exactly 0..size-1, one per cell.
      expect(new Set(p.regions).size).toBe(p.size)
      expect(Math.min(...p.regions)).toBe(0)
      expect(Math.max(...p.regions)).toBe(p.size - 1)
    }
  })

  it('every bank puzzle is uniquely solvable and its solution is valid', () => {
    for (const p of PUZZLE_BANK) {
      expect(solveQueens(p), p.id).not.toBeNull()
      expect(validateQueens(p, p.solution), p.id).toEqual({ ok: true })
      expect(countSolutions(p, 2), `${p.id} should be unique`).toBe(1)
    }
  })

  it('ids are unique and looked up by getPuzzle', () => {
    expect(new Set(PUZZLE_BANK.map((p) => p.id)).size).toBe(PUZZLE_BANK.length)
    expect(getPuzzle(PUZZLE_BANK[0].id)).toBe(PUZZLE_BANK[0])
    expect(getPuzzle('nope')).toBeUndefined()
  })
})
