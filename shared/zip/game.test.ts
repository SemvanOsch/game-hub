import { describe, it, expect } from 'vitest'
import { zipEngine } from './game'
import { createMatch, submitSolution, tickMatch, type ZipMatchState } from './engine'
import { getPlayerView } from './view'
import { solvePuzzle } from './validate'

/** A ready-to-play match (past the generating phase). */
function match(players: string[]): ZipMatchState {
  return tickMatch(createMatch(players, undefined, 1000, () => 0.42), 1000)
}

describe('zip engine adapter', () => {
  it('exposes 2–6 player limits and the timer hooks', () => {
    expect(zipEngine.id).toBe('zip')
    expect(zipEngine.minPlayers).toBe(2)
    expect(zipEngine.maxPlayers).toBe(6)
    expect(typeof zipEngine.nextTimeout).toBe('function')
    expect(typeof zipEngine.tick).toBe('function')
  })

  it('validates well-formed actions', () => {
    expect(zipEngine.validateAction({ type: 'advance' })).toEqual({ type: 'advance' })
    expect(zipEngine.validateAction({ type: 'submit_solution', round: 0, path: [0, 1, 2] })).toEqual({
      type: 'submit_solution',
      round: 0,
      path: [0, 1, 2]
    })
  })

  it('rejects malformed actions', () => {
    expect(zipEngine.validateAction(null)).toBeNull()
    expect(zipEngine.validateAction({ type: 'nope' })).toBeNull()
    expect(zipEngine.validateAction({ type: 'submit_solution', round: -1, path: [0] })).toBeNull()
    expect(zipEngine.validateAction({ type: 'submit_solution', round: 1.5, path: [0] })).toBeNull()
    expect(zipEngine.validateAction({ type: 'submit_solution', round: 0, path: 'x' })).toBeNull()
    expect(zipEngine.validateAction({ type: 'submit_solution', round: 0, path: [1, -2] })).toBeNull()
    expect(zipEngine.validateAction({ type: 'submit_solution', round: 0, path: [1.5] })).toBeNull()
    expect(zipEngine.validateAction({ type: 'submit_solution', round: 0, path: [] })).toBeNull()
  })

  it('reports no winner until the match is complete', () => {
    const s = match(['a', 'b'])
    expect(zipEngine.getWinnerIds(s)).toEqual([])
    expect(zipEngine.isFinished(s)).toBe(false)
  })
})

describe('getPlayerView — fairness & hidden information', () => {
  it('gives every player the same puzzle for the round', () => {
    const s = match(['a', 'b'])
    const va = getPlayerView(s, 'a')
    const vb = getPlayerView(s, 'b')
    expect(va.puzzle).toEqual(vb.puzzle)
    expect(va.puzzleIds).toEqual(vb.puzzleIds)
    expect(va.puzzle).toEqual(s.puzzles[0])
  })

  it('does not reveal opponents’ times during a live round', () => {
    let s = match(['a', 'b'])
    const path = solvePuzzle(s.puzzles[0])!
    s = (submitSolution(s, 'a', 0, path, s.rounds[0].startAt + 2500) as { ok: true; state: ZipMatchState }).state
    const vb = getPlayerView(s, 'b')
    // b can see that a finished, but no round times are exposed yet.
    expect(vb.phase).toBe('active')
    expect(vb.players.find((p) => p.id === 'a')!.finished).toBe(true)
    expect(vb.roundResults).toBeNull()
    // The leaderboard exposes only points/position, never times.
    expect(vb.leaderboard.every((r) => !('completionMs' in r))).toBe(true)
    // b's own status is available to b.
    expect(vb.self.finished).toBe(false)
  })

  it('reveals round times once the round is finalised', () => {
    let s = match(['a', 'b'])
    const path = solvePuzzle(s.puzzles[0])!
    s = (submitSolution(s, 'a', 0, path, s.rounds[0].startAt + 2500) as { ok: true; state: ZipMatchState }).state
    s = tickMatch(s, s.rounds[0].timeoutAt)
    const vb = getPlayerView(s, 'b')
    expect(vb.phase).toBe('round_results')
    expect(vb.roundResults).not.toBeNull()
    const a = vb.roundResults!.find((p) => p.playerId === 'a')!
    expect(a.completionMs).toBe(2500)
  })

  it('produces final results with full standings once complete', () => {
    const s = match(['a', 'b'])
    const complete: ZipMatchState = { ...s, phase: 'complete' }
    const results = zipEngine.getResults(complete)
    expect(results.standings).toHaveLength(2)
    expect(results.rounds.length).toBeGreaterThanOrEqual(1)
  })
})
