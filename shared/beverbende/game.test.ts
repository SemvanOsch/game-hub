import { describe, it, expect } from 'vitest'
import { beverbendeEngine } from './game'
import type { BeverbendeState } from './engine'

/** Deterministic mulberry32 PRNG. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('beverbendeEngine metadata', () => {
  it('advertises the right id and player bounds', () => {
    expect(beverbendeEngine.id).toBe('beverbende')
    expect(beverbendeEngine.minPlayers).toBe(2)
    expect(beverbendeEngine.maxPlayers).toBe(6)
  })
})

describe('validateAction', () => {
  const v = (raw: unknown) => beverbendeEngine.validateAction(raw)

  it('accepts well-formed actions', () => {
    expect(v({ type: 'ready' })).toEqual({ type: 'ready' })
    expect(v({ type: 'draw' })).toEqual({ type: 'draw' })
    expect(v({ type: 'knock' })).toEqual({ type: 'knock' })
    expect(v({ type: 'discardDrawn' })).toEqual({ type: 'discardDrawn' })
    expect(v({ type: 'useSpecial' })).toEqual({ type: 'useSpecial' })
    expect(v({ type: 'takeDiscard', position: 2 })).toEqual({ type: 'takeDiscard', position: 2 })
    expect(v({ type: 'replace', position: 0 })).toEqual({ type: 'replace', position: 0 })
    expect(v({ type: 'peek', position: 3 })).toEqual({ type: 'peek', position: 3 })
    expect(v({ type: 'swap', ownPosition: 1, targetId: 'x', targetPosition: 2 })).toEqual({
      type: 'swap',
      ownPosition: 1,
      targetId: 'x',
      targetPosition: 2
    })
  })

  it('rejects malformed or unknown actions', () => {
    expect(v(null)).toBeNull()
    expect(v('draw')).toBeNull()
    expect(v({ type: 'nope' })).toBeNull()
    expect(v({ type: 'takeDiscard' })).toBeNull()
    expect(v({ type: 'takeDiscard', position: '2' })).toBeNull()
    expect(v({ type: 'takeDiscard', position: 1.5 })).toBeNull()
    expect(v({ type: 'peek', position: null })).toBeNull()
    expect(v({ type: 'swap', ownPosition: 1, targetPosition: 2 })).toBeNull()
    expect(v({ type: 'swap', ownPosition: 1, targetId: '', targetPosition: 2 })).toBeNull()
  })
})

describe('engine lifecycle', () => {
  it('creates a game, exposes a sanitized view and finishes only when done', () => {
    const s = beverbendeEngine.createGame(['a', 'b', 'c']) as BeverbendeState
    expect(beverbendeEngine.isFinished(s)).toBe(false)
    const view = beverbendeEngine.getPlayerView(s, 'a')
    expect(view).toMatchObject({ selfId: 'a', currentPlayerId: expect.any(String) })
    // No winners reported while the game is unfinished.
    expect(beverbendeEngine.getWinnerIds(s)).toEqual([])
  })

  it('reports winners once finished', () => {
    const s = beverbendeEngine.createGame(['a', 'b']) as BeverbendeState
    s.status = 'finished'
    s.players['a'].cumulativeScore = 3
    s.players['b'].cumulativeScore = 9
    s.winnerIds = ['a']
    expect(beverbendeEngine.getWinnerIds(s)).toEqual(['a'])
  })

  it('removes a player and finishes a two-player game', () => {
    const s = beverbendeEngine.createGame(['a', 'b']) as BeverbendeState
    const next = beverbendeEngine.removePlayer(s, 'b') as BeverbendeState
    expect(next.status).toBe('finished')
    expect(beverbendeEngine.getWinnerIds(next)).toEqual(['a'])
  })

  it('schedules a reveal timeout and ticks into play', () => {
    const s = beverbendeEngine.createGame(['a', 'b'], undefined) as BeverbendeState
    const at = beverbendeEngine.nextTimeout!(s)
    expect(at).not.toBeNull()
    const next = beverbendeEngine.tick!(s, at!) as BeverbendeState
    expect(next.status).toBe('playing')
  })

  it('routes a validated action through applyAction', () => {
    void seededRng
    const s = beverbendeEngine.createGame(['a', 'b'], { rounds: 2 }) as BeverbendeState
    const action = beverbendeEngine.validateAction({ type: 'ready' })
    expect(action).not.toBeNull()
    const res = beverbendeEngine.applyAction(s, 'a', action!)
    expect(res.ok).toBe(true)
    if (res.ok) expect((res.state as BeverbendeState).players['a'].ready).toBe(true)
  })

  it('rejects an out-of-turn action with NOT_YOUR_TURN', () => {
    const s = beverbendeEngine.createGame(['a', 'b']) as BeverbendeState
    s.status = 'playing'
    s.currentPlayerId = 'a'
    const res = beverbendeEngine.applyAction(s, 'b', { type: 'draw' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_YOUR_TURN')
  })
})
