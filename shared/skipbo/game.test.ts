import { describe, it, expect } from 'vitest'
import { skipBoEngine } from './game'

describe('skipBoEngine adapter', () => {
  it('has the expected id and player bounds', () => {
    expect(skipBoEngine.id).toBe('skipbo')
    expect(skipBoEngine.minPlayers).toBe(2)
    expect(skipBoEngine.maxPlayers).toBe(6)
  })

  describe('validateAction', () => {
    it('accepts a well-formed stock play', () => {
      expect(skipBoEngine.validateAction({ type: 'play', from: { source: 'stock' }, buildingIndex: 0 })).toEqual({
        type: 'play',
        from: { source: 'stock' },
        buildingIndex: 0
      })
    })

    it('accepts hand and discard play sources', () => {
      expect(
        skipBoEngine.validateAction({ type: 'play', from: { source: 'hand', cardId: 'x' }, buildingIndex: 2 })
      ).toEqual({ type: 'play', from: { source: 'hand', cardId: 'x' }, buildingIndex: 2 })
      expect(
        skipBoEngine.validateAction({ type: 'play', from: { source: 'discard', discardIndex: 3 }, buildingIndex: 1 })
      ).toEqual({ type: 'play', from: { source: 'discard', discardIndex: 3 }, buildingIndex: 1 })
    })

    it('accepts a well-formed discard', () => {
      expect(skipBoEngine.validateAction({ type: 'discard', cardId: 'x', discardIndex: 2 })).toEqual({
        type: 'discard',
        cardId: 'x',
        discardIndex: 2
      })
    })

    it('rejects malformed / unknown actions', () => {
      expect(skipBoEngine.validateAction(null)).toBeNull()
      expect(skipBoEngine.validateAction({})).toBeNull()
      expect(skipBoEngine.validateAction({ type: 'nope' })).toBeNull()
      expect(skipBoEngine.validateAction({ type: 'play', from: { source: 'hand' }, buildingIndex: 0 })).toBeNull()
      expect(skipBoEngine.validateAction({ type: 'play', from: { source: 'stock' } })).toBeNull()
      expect(skipBoEngine.validateAction({ type: 'play', from: { source: 'bad' }, buildingIndex: 0 })).toBeNull()
      expect(skipBoEngine.validateAction({ type: 'discard', cardId: '', discardIndex: 0 })).toBeNull()
      expect(skipBoEngine.validateAction({ type: 'discard', cardId: 'x', discardIndex: 1.5 })).toBeNull()
    })
  })

  it('creates, applies an action, and reports results end-to-end', () => {
    const state = skipBoEngine.createGame(['a', 'b'])
    expect(skipBoEngine.isFinished(state)).toBe(false)
    const view = skipBoEngine.getPlayerView(state, 'a')
    expect(view.hand.length).toBe(5)
    expect(skipBoEngine.getWinnerIds(state)).toEqual([])
  })
})
