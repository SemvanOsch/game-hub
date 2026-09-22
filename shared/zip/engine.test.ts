import { describe, it, expect } from 'vitest'
import {
  COUNTDOWN_MS,
  ROUND_DURATION_MS,
  TOTAL_ROUNDS,
  advanceRound,
  computeStandings,
  createMatch,
  getWinnerIds,
  isMatchFinished,
  nextTimeout,
  removePlayerFromMatch,
  submitSolution,
  tickMatch,
  type ZipMatchState
} from './engine'
import { solvePuzzle } from './validate'

/**
 * A ready-to-play match: created, then advanced past the brief `generating`
 * phase (the tick that generates puzzles and opens round 1). Deterministic via a
 * fixed seed.
 */
function newMatch(players: string[], now = 1000): ZipMatchState {
  return tickMatch(createMatch(players, undefined, now, () => 0.42), now)
}

function solutionFor(state: ZipMatchState, roundIndex: number): number[] {
  return solvePuzzle(state.puzzles[roundIndex])!
}

/** Submit the correct solution for a player at `atMs` into the current round. */
function finishRound(state: ZipMatchState, pid: string, atMs: number): ZipMatchState {
  const round = state.currentRound
  const now = state.rounds[round].startAt + atMs
  const res = submitSolution(state, pid, round, solutionFor(state, round), now)
  expect(res.ok, `submit for ${pid} should succeed`).toBe(true)
  return (res as { ok: true; state: ZipMatchState }).state
}

describe('createMatch & generation', () => {
  it('opens in the generating phase with no puzzles yet', () => {
    const s = createMatch(['a', 'b'], undefined, 1000, () => 0.42)
    expect(s.phase).toBe('generating')
    expect(s.puzzles).toHaveLength(0)
    expect(s.rounds).toHaveLength(0)
    expect(nextTimeout(s)).toBe(s.generateAt)
  })

  it('the first tick generates three distinct puzzles and opens round 1', () => {
    const s = newMatch(['a', 'b'])
    expect(s.phase).toBe('active')
    expect(s.totalRounds).toBe(TOTAL_ROUNDS)
    expect(s.currentRound).toBe(0)
    expect(s.puzzles).toHaveLength(3)
    expect(new Set(s.puzzles.map((p) => p.id)).size).toBe(3)
    expect(s.puzzles.map((p) => p.difficulty)).toEqual(['easy', 'medium', 'hard'])
    // Every generated puzzle is solvable.
    for (const p of s.puzzles) expect(solvePuzzle(p)).not.toBeNull()
    expect(s.hostId).toBe('a')
    expect(s.totals).toEqual({ a: 0, b: 0 })
  })

  it('generation is deterministic for a given seed', () => {
    const seedRng = () => 0.42
    const a = tickMatch(createMatch(['a', 'b'], undefined, 1000, seedRng), 1000)
    const b = tickMatch(createMatch(['a', 'b'], undefined, 1000, seedRng), 1000)
    expect(a.puzzles).toEqual(b.puzzles)
  })

  it('starts round 1 with a countdown then a timeout window', () => {
    const s = newMatch(['a', 'b'], 1000)
    const r = s.rounds[0]
    expect(r.startAt).toBe(1000 + COUNTDOWN_MS)
    expect(r.timeoutAt).toBe(1000 + COUNTDOWN_MS + ROUND_DURATION_MS)
  })
})

describe('submitSolution — validation & timing', () => {
  it('records the official completion time from the server clock', () => {
    let s = newMatch(['a', 'b'])
    s = finishRound(s, 'a', 4200)
    expect(s.rounds[0].results.a.finished).toBe(true)
    expect(s.rounds[0].results.a.completionMs).toBe(4200)
  })

  it('rejects a submission before the round officially starts', () => {
    const s = newMatch(['a', 'b'])
    const res = submitSolution(s, 'a', 0, solutionFor(s, 0), s.rounds[0].startAt - 1)
    expect(res.ok).toBe(false)
  })

  it('rejects a submission after the timeout', () => {
    const s = newMatch(['a', 'b'])
    const res = submitSolution(s, 'a', 0, solutionFor(s, 0), s.rounds[0].timeoutAt + 1)
    expect(res.ok).toBe(false)
  })

  it('rejects a second submission from a player who already finished', () => {
    let s = newMatch(['a', 'b'])
    s = finishRound(s, 'a', 1000)
    const res = submitSolution(s, 'a', 0, solutionFor(s, 0), s.rounds[0].startAt + 2000)
    expect(res.ok).toBe(false)
  })

  it('rejects a submission targeting the wrong round', () => {
    const s = newMatch(['a', 'b'])
    const res = submitSolution(s, 'a', 2, solutionFor(s, 0), s.rounds[0].startAt + 1000)
    expect(res.ok).toBe(false)
  })

  it('rejects an invalid path', () => {
    const s = newMatch(['a', 'b'])
    const res = submitSolution(s, 'a', 0, [0, 1, 2], s.rounds[0].startAt + 1000)
    expect(res.ok).toBe(false)
  })

  it('rejects a submission from a non-participant', () => {
    const s = newMatch(['a', 'b'])
    const res = submitSolution(s, 'ghost', 0, solutionFor(s, 0), s.rounds[0].startAt + 1000)
    expect(res.ok).toBe(false)
  })
})

describe('round completion & scoring', () => {
  it('finalises the round once every player finishes, ranking by time', () => {
    let s = newMatch(['a', 'b'])
    s = finishRound(s, 'a', 3000)
    expect(s.phase).toBe('active') // still waiting for b
    s = finishRound(s, 'b', 6000)
    expect(s.phase).toBe('round_results')
    const places = s.rounds[0].placements!
    expect(places[0]).toMatchObject({ playerId: 'a', place: 1, points: 2 })
    expect(places[1]).toMatchObject({ playerId: 'b', place: 2, points: 1 })
    expect(s.totals).toEqual({ a: 2, b: 1 })
  })

  it('awards placement points equal to player count down to 1, for 2..6 players', () => {
    for (let n = 2; n <= 6; n++) {
      const players = Array.from({ length: n }, (_, i) => `p${i}`)
      let s = newMatch(players)
      // Each player finishes later than the previous, so ranking == join order.
      players.forEach((p, i) => {
        s = finishRound(s, p, (i + 1) * 1000)
      })
      expect(s.phase).toBe('round_results')
      const places = s.rounds[0].placements!
      players.forEach((p, i) => {
        expect(places[i]).toMatchObject({ playerId: p, place: i + 1, points: n - i })
      })
      // Max points for the round equals the player count.
      expect(Math.max(...places.map((pl) => pl.points))).toBe(n)
    }
  })

  it('breaks identical completion times by join order deterministically', () => {
    let s = newMatch(['a', 'b'])
    // Both submit with the same offset → same completionMs.
    s = finishRound(s, 'b', 5000)
    s = finishRound(s, 'a', 5000)
    const places = s.rounds[0].placements!
    // a joined first, so it ranks ahead on a tie.
    expect(places[0].playerId).toBe('a')
    expect(places[1].playerId).toBe('b')
  })
})

describe('timeout / DNF', () => {
  it('marks unfinished players DNF at the timeout and finalises the round', () => {
    let s = newMatch(['a', 'b'])
    s = finishRound(s, 'a', 3000)
    s = tickMatch(s, s.rounds[0].timeoutAt)
    expect(s.phase).toBe('round_results')
    const b = s.rounds[0].placements!.find((p) => p.playerId === 'b')!
    expect(b.dnf).toBe(true)
    expect(b.points).toBe(0)
    expect(s.totals).toEqual({ a: 2, b: 0 })
  })

  it('does nothing before the timeout', () => {
    const s = newMatch(['a', 'b'])
    const before = s.rounds[0].timeoutAt - 1
    expect(tickMatch(s, before)).toBe(s)
  })

  it('nextTimeout is the running round end, and null once ranked', () => {
    let s = newMatch(['a', 'b'])
    expect(nextTimeout(s)).toBe(s.rounds[0].timeoutAt)
    s = finishRound(s, 'a', 1000)
    s = finishRound(s, 'b', 2000)
    expect(nextTimeout(s)).toBeNull()
  })
})

describe('round transitions', () => {
  function toResults(players: string[]): ZipMatchState {
    let s = newMatch(players)
    players.forEach((p, i) => (s = finishRound(s, p, (i + 1) * 1000)))
    return s
  }

  it('only the host may advance, and only from the results screen', () => {
    const s = toResults(['a', 'b'])
    expect(advanceRound(s, 'b', 0).ok).toBe(false) // not host
    const active = newMatch(['a', 'b'])
    expect(advanceRound(active, 'a', 0).ok).toBe(false) // not in results
  })

  it('advances to the next round with the next puzzle', () => {
    const s = toResults(['a', 'b'])
    const res = advanceRound(s, 'a', 999_999)
    expect(res.ok).toBe(true)
    const next = (res as { ok: true; state: ZipMatchState }).state
    expect(next.currentRound).toBe(1)
    expect(next.phase).toBe('active')
    expect(next.rounds[1].puzzleId).toBe(next.puzzles[1].id)
    expect(next.rounds[1].startAt).toBe(999_999 + COUNTDOWN_MS)
  })

  it('completes the match after round 3 — never a fourth round', () => {
    let s = newMatch(['a', 'b'])
    for (let round = 0; round < TOTAL_ROUNDS; round++) {
      s = finishRound(s, 'a', 1000)
      s = finishRound(s, 'b', 2000)
      expect(s.phase).toBe('round_results')
      const res = advanceRound(s, 'a', s.rounds[round].timeoutAt + 1000)
      s = (res as { ok: true; state: ZipMatchState }).state
    }
    expect(s.phase).toBe('complete')
    expect(isMatchFinished(s)).toBe(true)
    expect(s.currentRound).toBe(TOTAL_ROUNDS - 1)
    // No further advance possible.
    expect(advanceRound(s, 'a', 0).ok).toBe(false)
  })
})

describe('final winner & tie-breaks', () => {
  function playFullMatch(
    players: string[],
    times: Array<Record<string, number | null>>
  ): ZipMatchState {
    let s = newMatch(players)
    for (let round = 0; round < TOTAL_ROUNDS; round++) {
      for (const p of players) {
        const t = times[round][p]
        if (t !== null && t !== undefined) s = finishRound(s, p, t)
      }
      // Time out anyone who didn't finish, then finalise/advance.
      if (s.phase === 'active') s = tickMatch(s, s.rounds[round].timeoutAt)
      const res = advanceRound(s, s.hostId, s.rounds[round].timeoutAt + 1000)
      s = (res as { ok: true; state: ZipMatchState }).state
    }
    return s
  }

  it('the highest total wins', () => {
    const s = playFullMatch(
      ['a', 'b'],
      [
        { a: 1000, b: 2000 },
        { a: 1000, b: 2000 },
        { a: 2000, b: 1000 }
      ]
    )
    expect(s.phase).toBe('complete')
    // a: 2+2+1 = 5, b: 1+1+2 = 4.
    expect(s.totals).toEqual({ a: 5, b: 4 })
    expect(getWinnerIds(s)).toEqual(['a'])
  })

  it('breaks an equal total by cumulative completion time', () => {
    // Equal totals (2 each) and equal round wins (1 each); a finished its one
    // round faster, so a wins on cumulative time.
    const s = playFullMatch(
      ['a', 'b'],
      [
        { a: 500, b: null },
        { a: null, b: 1500 },
        { a: null, b: null }
      ]
    )
    expect(s.totals).toEqual({ a: 2, b: 2 })
    const standings = computeStandings(s)
    expect(standings[0].playerId).toBe('a')
    expect(getWinnerIds(s)).toEqual(['a'])
  })

  it('returns a genuine tie when totals, round wins and times all match', () => {
    const s = playFullMatch(
      ['a', 'b'],
      [
        { a: 1000, b: null },
        { a: null, b: 1000 },
        { a: null, b: null }
      ]
    )
    expect(s.totals).toEqual({ a: 2, b: 2 })
    expect(getWinnerIds(s).sort()).toEqual(['a', 'b'])
  })
})

describe('disconnects', () => {
  it('marks a mid-round leaver DNF and can complete the round', () => {
    let s = newMatch(['a', 'b'])
    s = finishRound(s, 'a', 3000)
    const next = removePlayerFromMatch(s, 'b')!
    expect(next.phase).toBe('round_results') // a already done, b now DNF → complete
    expect(next.playerOrder).toEqual(['a'])
    const b = next.rounds[0].placements!.find((p) => p.playerId === 'b')!
    expect(b.dnf).toBe(true)
  })

  it('keeps a finished leaver’s recorded result and points', () => {
    let s = newMatch(['a', 'b', 'c'])
    s = finishRound(s, 'a', 1000)
    s = finishRound(s, 'b', 2000)
    s = finishRound(s, 'c', 3000)
    // a leaves during the results screen.
    const next = removePlayerFromMatch(s, 'a')!
    expect(next.totals.a).toBe(3) // 3 players → 1st = 3 points, retained
    expect(next.rounds[0].placements!.find((p) => p.playerId === 'a')!.points).toBe(3)
  })

  it('reassigns the host to the next player', () => {
    const s = newMatch(['a', 'b', 'c'])
    const next = removePlayerFromMatch(s, 'a')!
    expect(next.hostId).toBe('b')
  })

  it('returns null only when the last player leaves', () => {
    const s = newMatch(['a', 'b'])
    const one = removePlayerFromMatch(s, 'a')!
    expect(one.playerOrder).toEqual(['b'])
    expect(removePlayerFromMatch(one, 'b')).toBeNull()
  })
})
