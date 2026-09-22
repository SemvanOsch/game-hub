import { describe, it, expect } from 'vitest'
import { PUZZLE_BANK, getPuzzle, selectMatchPuzzles } from './bank'
import { checkpointCount } from './puzzles'
import { solvePuzzle, validatePath } from './validate'

describe('zip puzzle bank', () => {
  it('has unique puzzle ids', () => {
    const ids = PUZZLE_BANK.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every puzzle is solvable and its solution validates', () => {
    for (const puzzle of PUZZLE_BANK) {
      const solution = solvePuzzle(puzzle)
      expect(solution, `puzzle ${puzzle.id} should be solvable`).not.toBeNull()
      expect(validatePath(puzzle, solution!).ok, `solution for ${puzzle.id} valid`).toBe(true)
    }
  })

  it('checkpoints are the consecutive integers 1..N', () => {
    for (const puzzle of PUZZLE_BANK) {
      const numbers = Object.values(puzzle.checkpoints).sort((a, b) => a - b)
      const n = checkpointCount(puzzle)
      expect(numbers).toEqual(Array.from({ length: n }, (_, i) => i + 1))
    }
  })

  it('walls reference in-range, orthogonally adjacent cells', () => {
    for (const puzzle of PUZZLE_BANK) {
      const total = puzzle.rows * puzzle.cols
      for (const [a, b] of puzzle.walls) {
        expect(a).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThan(total)
        const ra = Math.floor(a / puzzle.cols)
        const rb = Math.floor(b / puzzle.cols)
        const ca = a % puzzle.cols
        const cb = b % puzzle.cols
        expect(Math.abs(ra - rb) + Math.abs(ca - cb)).toBe(1)
      }
    }
  })
})

describe('selectMatchPuzzles', () => {
  it('picks exactly three distinct puzzles', () => {
    const ids = selectMatchPuzzles(() => 0.5)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(getPuzzle(id)).toBeDefined()
  })

  it('escalates difficulty easy → medium → hard', () => {
    const ids = selectMatchPuzzles(() => 0.5)
    const diffs = ids.map((id) => getPuzzle(id)!.difficulty)
    expect(diffs).toEqual(['easy', 'medium', 'hard'])
  })

  it('is deterministic for a given rng', () => {
    const seq = [0.1, 0.9, 0.4, 0.7, 0.2, 0.6]
    let i = 0
    const rng = () => seq[i++ % seq.length]
    i = 0
    const a = selectMatchPuzzles(rng)
    i = 0
    const b = selectMatchPuzzles(rng)
    expect(a).toEqual(b)
  })
})
