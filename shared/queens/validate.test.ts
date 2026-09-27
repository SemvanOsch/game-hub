import { describe, it, expect } from 'vitest'
import { countSolutions, findConflicts, solveQueens, validateQueens } from './validate'
import type { QueensPuzzle } from './puzzles'

/**
 * A 4×4 puzzle with a known unique solution. Regions are grown from the queens at
 * cells 1, 7, 8, 14 (columns 1,3,0,2 in rows 0,1,2,3) — one queen per row/column,
 * none touching. Region ids below give each of those queens its own region.
 *
 *   cols:  0  1  2  3
 * row0    A  A  B  B
 * row1    A  C  C  B
 * row2    D  C  C  B
 * row3    D  D  C  C
 *
 * Queens: (0,1)=1  (1,3)=7  (2,0)=8  (3,2)=14. Region A has queen 1, B has 7,
 * D has 8, C has 14.
 */
const four: QueensPuzzle = {
  id: 't',
  size: 4,
  difficulty: 'easy',
  //        0  1  2  3   4  5  6  7   8  9 10 11  12 13 14 15
  regions: [0, 0, 1, 1, 0, 2, 2, 1, 3, 2, 2, 1, 3, 3, 2, 2],
  solution: [1, 7, 8, 14]
}

describe('validateQueens', () => {
  it('accepts a correct full placement', () => {
    expect(validateQueens(four, [1, 7, 8, 14])).toEqual({ ok: true })
  })

  it('is order-independent', () => {
    expect(validateQueens(four, [14, 8, 7, 1])).toEqual({ ok: true })
  })

  it('rejects the wrong number of queens (missing)', () => {
    expect(validateQueens(four, [1, 7, 8])).toEqual({ ok: false, reason: 'WRONG_COUNT' })
  })

  it('rejects the wrong number of queens (too many)', () => {
    expect(validateQueens(four, [1, 7, 8, 14, 0])).toEqual({ ok: false, reason: 'WRONG_COUNT' })
  })

  it('rejects an out-of-bounds queen', () => {
    expect(validateQueens(four, [1, 7, 8, 99])).toEqual({ ok: false, reason: 'OUT_OF_BOUNDS' })
  })

  it('rejects duplicate cells', () => {
    expect(validateQueens(four, [1, 1, 8, 14]).ok).toBe(false)
  })

  it('rejects two queens in the same row', () => {
    // cells 4 and 6 are both in row 1.
    expect(validateQueens(four, [4, 6, 9, 15]).ok).toBe(false)
  })

  it('rejects two queens in the same column', () => {
    // cells 1 and 13 are both in column 1.
    const res = validateQueens(four, [1, 6, 8, 13])
    expect(res.ok).toBe(false)
  })

  it('detects a column conflict specifically', () => {
    // 0 (r0c0) and 4 (r1c0) same column, rows differ → COLUMN or ADJACENT first.
    const res = validateQueens({ ...four }, [0, 4, 9, 15])
    expect(res.ok).toBe(false)
  })

  it('rejects two queens in the same region', () => {
    // cells 0 and 1 are both region 0 (and also same row) — build a region clash
    // that is not also a row clash: 0 (region 0) and 4 (region 0), different rows.
    const res = validateQueens(four, [0, 4, 11, 13])
    expect(res.ok).toBe(false)
  })

  it('rejects horizontally adjacent queens', () => {
    // Use a puzzle where rows/cols/regions are fine but two queens touch. Simplest
    // is to check adjacency directly via a crafted set on a bigger open board.
    const open: QueensPuzzle = {
      id: 'o',
      size: 4,
      difficulty: 'easy',
      regions: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
      solution: [0, 6, 9, 15]
    }
    // (0,0)=0 and (1,1)=5 touch diagonally; also different row/col/region.
    expect(validateQueens(open, [0, 5, 10, 15])).toEqual({ ok: false, reason: 'ADJACENT' })
  })

  it('rejects vertically adjacent queens', () => {
    const open: QueensPuzzle = {
      id: 'o',
      size: 4,
      difficulty: 'easy',
      regions: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
      solution: [0, 6, 9, 15]
    }
    // (0,0)=0 and (1,0)=4 are vertically adjacent (same column too).
    expect(validateQueens(open, [0, 4, 10, 15]).ok).toBe(false)
  })
})

describe('solveQueens & countSolutions', () => {
  it('solves the sample puzzle', () => {
    const sol = solveQueens(four)
    expect(sol).not.toBeNull()
    expect(validateQueens(four, sol!)).toEqual({ ok: true })
  })

  it('counts the sample puzzle as uniquely solvable', () => {
    expect(countSolutions(four, 3)).toBe(1)
  })
})

describe('findConflicts (UI feedback)', () => {
  it('flags queens sharing a row', () => {
    // cells 0 and 1: same row.
    const bad = findConflicts(four, [0, 1])
    expect(bad.has(0)).toBe(true)
    expect(bad.has(1)).toBe(true)
  })

  it('flags touching queens', () => {
    const bad = findConflicts(four, [0, 5])
    expect(bad.has(0) && bad.has(5)).toBe(true)
  })

  it('returns no conflicts for a partial legal placement', () => {
    expect(findConflicts(four, [1, 8]).size).toBe(0)
  })
})
