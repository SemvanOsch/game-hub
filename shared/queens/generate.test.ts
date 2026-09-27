import { describe, it, expect } from 'vitest'
import {
  MATCH_TIERS,
  generateMatchPuzzles,
  generatePuzzle,
  generateSolution,
  mulberry32
} from './generate'
import { countSolutions, solveQueens, validateQueens } from './validate'

describe('generateSolution', () => {
  it('produces a valid non-touching permutation for sizes 4..8', () => {
    for (let size = 4; size <= 8; size++) {
      const sol = generateSolution(size, mulberry32(size * 7 + 1))
      expect(sol, `size ${size}`).not.toBeNull()
      expect(sol!).toHaveLength(size)
      const rows = new Set(sol!.map((c) => Math.floor(c / size)))
      const cols = new Set(sol!.map((c) => c % size))
      expect(rows.size).toBe(size)
      expect(cols.size).toBe(size)
      // No two touching.
      for (let i = 0; i < sol!.length; i++) {
        for (let j = i + 1; j < sol!.length; j++) {
          const a = sol![i]
          const b = sol![j]
          const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size))
          const dc = Math.abs((a % size) - (b % size))
          expect(dr > 1 || dc > 1).toBe(true)
        }
      }
    }
  })
})

describe('generatePuzzle', () => {
  it('always produces a solvable puzzle whose stored solution is valid', () => {
    for (const spec of MATCH_TIERS) {
      const p = generatePuzzle(spec, spec.difficulty, mulberry32(999))!
      expect(p).not.toBeNull()
      expect(p.size).toBe(spec.size)
      expect(p.regions).toHaveLength(spec.size * spec.size)
      // Every cell belongs to exactly one region 0..size-1.
      expect(new Set(p.regions).size).toBe(spec.size)
      expect(Math.min(...p.regions)).toBe(0)
      expect(Math.max(...p.regions)).toBe(spec.size - 1)
      // The stored solution is a genuine valid solution.
      expect(validateQueens(p, p.solution)).toEqual({ ok: true })
      // And the puzzle is solvable by the independent solver.
      expect(solveQueens(p)).not.toBeNull()
    }
  })
})

describe('generateMatchPuzzles', () => {
  it('returns three escalating, distinct, solvable puzzles', () => {
    const puzzles = generateMatchPuzzles(mulberry32(42))
    expect(puzzles).toHaveLength(3)
    expect(puzzles.map((p) => p.difficulty)).toEqual(['easy', 'medium', 'hard'])
    expect(puzzles.map((p) => p.size)).toEqual([6, 7, 8])
    expect(new Set(puzzles.map((p) => p.id)).size).toBe(3)
    for (const p of puzzles) {
      expect(solveQueens(p)).not.toBeNull()
      expect(validateQueens(p, p.solution)).toEqual({ ok: true })
    }
  })

  it('is deterministic for a given seed', () => {
    const a = generateMatchPuzzles(mulberry32(7))
    const b = generateMatchPuzzles(mulberry32(7))
    expect(a).toEqual(b)
  })

  it('prefers uniquely-solvable puzzles most of the time', () => {
    // Not a hard guarantee, but the generator should usually find unique layouts.
    let unique = 0
    for (let s = 0; s < 6; s++) {
      const p = generatePuzzle(MATCH_TIERS[0], 'x', mulberry32(s + 1))!
      if (countSolutions(p, 2) === 1) unique++
    }
    expect(unique).toBeGreaterThan(0)
  })
})
