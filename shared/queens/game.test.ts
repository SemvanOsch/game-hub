import { describe, it, expect } from 'vitest'
import { queensEngine } from './game'
import { createMatch, submitSolution, tickMatch, type QueensMatchState } from './engine'
import { getPlayerView } from './view'

/** A ready-to-play match (past the generating phase). */
function match(players: string[]): QueensMatchState {
  return tickMatch(createMatch(players, undefined, 1000, () => 0.42), 1000)
}

describe('queens engine adapter', () => {
  it('exposes 2–6 player limits and the timer hooks', () => {
    expect(queensEngine.id).toBe('queens')
    expect(queensEngine.minPlayers).toBe(2)
    expect(queensEngine.maxPlayers).toBe(6)
    expect(typeof queensEngine.nextTimeout).toBe('function')
    expect(typeof queensEngine.tick).toBe('function')
  })

  it('validates well-formed actions', () => {
    expect(queensEngine.validateAction({ type: 'advance' })).toEqual({ type: 'advance' })
    expect(
      queensEngine.validateAction({ type: 'submit_solution', round: 0, queens: [0, 8, 17] })
    ).toEqual({ type: 'submit_solution', round: 0, queens: [0, 8, 17] })
  })

  it('rejects malformed actions', () => {
    expect(queensEngine.validateAction(null)).toBeNull()
    expect(queensEngine.validateAction({ type: 'nope' })).toBeNull()
    expect(queensEngine.validateAction({ type: 'submit_solution', round: -1, queens: [0] })).toBeNull()
    expect(queensEngine.validateAction({ type: 'submit_solution', round: 1.5, queens: [0] })).toBeNull()
    expect(queensEngine.validateAction({ type: 'submit_solution', round: 0, queens: 'x' })).toBeNull()
    expect(queensEngine.validateAction({ type: 'submit_solution', round: 0, queens: [1, -2] })).toBeNull()
    expect(queensEngine.validateAction({ type: 'submit_solution', round: 0, queens: [1.5] })).toBeNull()
    expect(queensEngine.validateAction({ type: 'submit_solution', round: 0, queens: [] })).toBeNull()
  })

  it('reports no winner until the match is complete', () => {
    const s = match(['a', 'b'])
    expect(queensEngine.getWinnerIds(s)).toEqual([])
    expect(queensEngine.isFinished(s)).toBe(false)
  })
})

describe('getPlayerView — fairness & hidden information', () => {
  it('gives every player the same puzzle region layout for the round', () => {
    const s = match(['a', 'b'])
    const va = getPlayerView(s, 'a')
    const vb = getPlayerView(s, 'b')
    expect(va.puzzle).toEqual(vb.puzzle)
    expect(va.puzzleIds).toEqual(vb.puzzleIds)
    expect(va.puzzle!.regions).toEqual(s.puzzles[0].regions)
  })

  it('NEVER sends the puzzle solution to the client', () => {
    const s = match(['a', 'b'])
    const view = getPlayerView(s, 'a')
    // The client puzzle carries id/size/regions/difficulty — but no solution.
    expect(view.puzzle).not.toBeNull()
    expect('solution' in (view.puzzle as object)).toBe(false)
    // Deep-scan the whole serialized view for the answer just to be safe.
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain('solution')
  })

  it('does not reveal opponents’ times during a live round', () => {
    let s = match(['a', 'b'])
    const sol = s.puzzles[0].solution
    s = (submitSolution(s, 'a', 0, sol, s.rounds[0].startAt + 2500) as { ok: true; state: QueensMatchState }).state
    const vb = getPlayerView(s, 'b')
    expect(vb.phase).toBe('active')
    expect(vb.players.find((p) => p.id === 'a')!.finished).toBe(true)
    expect(vb.roundResults).toBeNull()
    expect(vb.leaderboard.every((r) => !('completionMs' in r))).toBe(true)
    expect(vb.self.finished).toBe(false)
  })

  it('reveals round times once the round is finalised', () => {
    let s = match(['a', 'b'])
    const sol = s.puzzles[0].solution
    s = (submitSolution(s, 'a', 0, sol, s.rounds[0].startAt + 2500) as { ok: true; state: QueensMatchState }).state
    s = tickMatch(s, s.rounds[0].timeoutAt)
    const vb = getPlayerView(s, 'b')
    expect(vb.phase).toBe('round_results')
    expect(vb.roundResults).not.toBeNull()
    const a = vb.roundResults!.find((p) => p.playerId === 'a')!
    expect(a.completionMs).toBe(2500)
  })

  it('produces final results with full standings once complete', () => {
    const s = match(['a', 'b'])
    const complete: QueensMatchState = { ...s, phase: 'complete' }
    const results = queensEngine.getResults(complete)
    expect(results.standings).toHaveLength(2)
    expect(results.rounds.length).toBeGreaterThanOrEqual(1)
  })
})
