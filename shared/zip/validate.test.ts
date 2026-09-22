import { describe, it, expect } from 'vitest'
import { validatePath } from './validate'
import type { ZipPuzzle } from './puzzles'

/**
 * 2×2 grid, checkpoint 1 at cell 0 and checkpoint 2 at cell 1. The only
 * Hamiltonian path between these (adjacent) corners is 0 → 2 → 3 → 1.
 */
const twoByTwo: ZipPuzzle = {
  id: 't',
  rows: 2,
  cols: 2,
  difficulty: 'easy',
  checkpoints: { 0: 1, 1: 2 },
  walls: []
}

/** Same grid but with three ordered checkpoints (0→1, 1→2, 3→3). */
const ordered: ZipPuzzle = {
  id: 'o',
  rows: 2,
  cols: 2,
  difficulty: 'easy',
  checkpoints: { 0: 1, 1: 2, 3: 3 },
  walls: []
}

describe('validatePath', () => {
  it('accepts a correct full path', () => {
    // 0 → 2 → 3 → 1 covers every cell, starts at 1, ends at the last checkpoint.
    expect(validatePath(twoByTwo, [0, 2, 3, 1])).toEqual({ ok: true })
  })

  it('rejects an empty path', () => {
    expect(validatePath(twoByTwo, [])).toEqual({ ok: false, reason: 'EMPTY' })
  })

  it('rejects a path that does not start at checkpoint 1', () => {
    expect(validatePath(twoByTwo, [1, 0, 2, 3])).toEqual({ ok: false, reason: 'BAD_START' })
  })

  it('rejects diagonal / non-adjacent movement', () => {
    // 0 → 3 is a diagonal jump.
    expect(validatePath(twoByTwo, [0, 3, 1, 2])).toEqual({ ok: false, reason: 'NOT_ADJACENT' })
  })

  it('rejects crossing a wall', () => {
    const walled: ZipPuzzle = { ...twoByTwo, walls: [[0, 2]] }
    expect(validatePath(walled, [0, 2, 3, 1])).toEqual({ ok: false, reason: 'WALL' })
  })

  it('rejects revisiting a cell', () => {
    expect(validatePath(twoByTwo, [0, 2, 0, 1])).toEqual({ ok: false, reason: 'REVISIT' })
  })

  it('rejects an incomplete path (missing cells)', () => {
    expect(validatePath(twoByTwo, [0, 2])).toEqual({ ok: false, reason: 'INCOMPLETE' })
  })

  it('rejects visiting checkpoints out of order', () => {
    // Reaches cell 3 (checkpoint 3) before cell 1 (checkpoint 2).
    expect(validatePath(ordered, [0, 2, 3, 1])).toEqual({ ok: false, reason: 'CHECKPOINT_ORDER' })
  })

  it('rejects a path that does not end on the highest checkpoint', () => {
    // Checkpoint 2 sits at cell 2; a full, in-order path that ends at cell 1
    // (a non-checkpoint) is complete and ordered but ends in the wrong place.
    const endCase: ZipPuzzle = {
      id: 'e',
      rows: 2,
      cols: 2,
      difficulty: 'easy',
      checkpoints: { 0: 1, 2: 2 },
      walls: []
    }
    expect(validatePath(endCase, [0, 2, 3, 1])).toEqual({ ok: false, reason: 'BAD_END' })
    // Sanity: ending on the highest checkpoint is valid.
    expect(validatePath(endCase, [0, 1, 3, 2])).toEqual({ ok: true })
  })
})
