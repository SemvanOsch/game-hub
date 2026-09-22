import { describe, it, expect } from 'vitest'
import { unoEngine } from './game'
import type { UnoGameState } from './engine'

/** getWinnerIds only reads status/winnerId, so a minimal cast state suffices. */
function stateWithWinner(winnerId?: string): UnoGameState {
  return { status: 'finished', winnerId } as unknown as UnoGameState
}

describe('uno engine adapter', () => {
  it('exposes the expected player limits', () => {
    expect(unoEngine.id).toBe('uno')
    expect(unoEngine.minPlayers).toBe(2)
    expect(unoEngine.maxPlayers).toBe(8)
  })

  it('reports the single winner id', () => {
    expect(unoEngine.getWinnerIds(stateWithWinner('a'))).toEqual(['a'])
    expect(unoEngine.getWinnerIds(stateWithWinner(undefined))).toEqual([])
  })

  describe('validateAction narrows untrusted client input', () => {
    it('accepts a well-formed play_card, dropping unknown fields', () => {
      expect(
        unoEngine.validateAction({ type: 'play_card', cardId: 'u5', evil: 'x' })
      ).toEqual({ type: 'play_card', cardId: 'u5' })
    })

    it('accepts a play_card with a valid colour and declareUno', () => {
      expect(
        unoEngine.validateAction({
          type: 'play_card',
          cardId: 'u5',
          chosenColor: 'red',
          declareUno: true
        })
      ).toEqual({ type: 'play_card', cardId: 'u5', chosenColor: 'red', declareUno: true })
    })

    it('rejects play_card with a bad colour or non-boolean declareUno', () => {
      expect(unoEngine.validateAction({ type: 'play_card', cardId: 'u5', chosenColor: 'purple' })).toBeNull()
      expect(unoEngine.validateAction({ type: 'play_card', cardId: 'u5', declareUno: 'yes' })).toBeNull()
    })

    it('rejects play_card without a valid cardId', () => {
      expect(unoEngine.validateAction({ type: 'play_card' })).toBeNull()
      expect(unoEngine.validateAction({ type: 'play_card', cardId: 42 })).toBeNull()
      expect(unoEngine.validateAction({ type: 'play_card', cardId: '' })).toBeNull()
    })

    it('validates choose_color only for real colours', () => {
      expect(unoEngine.validateAction({ type: 'choose_color', color: 'blue' })).toEqual({
        type: 'choose_color',
        color: 'blue'
      })
      expect(unoEngine.validateAction({ type: 'choose_color', color: 'rainbow' })).toBeNull()
      expect(unoEngine.validateAction({ type: 'choose_color' })).toBeNull()
    })

    it('validates the parameterless actions', () => {
      expect(unoEngine.validateAction({ type: 'draw_card' })).toEqual({ type: 'draw_card' })
      expect(unoEngine.validateAction({ type: 'pass' })).toEqual({ type: 'pass' })
      expect(unoEngine.validateAction({ type: 'call_uno' })).toEqual({ type: 'call_uno' })
    })

    it('validates catch_uno with a target id', () => {
      expect(unoEngine.validateAction({ type: 'catch_uno', targetId: 'x' })).toEqual({
        type: 'catch_uno',
        targetId: 'x'
      })
      expect(unoEngine.validateAction({ type: 'catch_uno' })).toBeNull()
    })

    it('rejects junk', () => {
      expect(unoEngine.validateAction(null)).toBeNull()
      expect(unoEngine.validateAction('draw_card')).toBeNull()
      expect(unoEngine.validateAction({ type: 'nope' })).toBeNull()
      expect(unoEngine.validateAction(42)).toBeNull()
    })
  })
})
