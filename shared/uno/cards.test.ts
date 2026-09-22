import { describe, it, expect } from 'vitest'
import {
  createUnoDeck,
  isWild,
  matchesTop,
  shuffle,
  UNO_COLORS,
  type UnoCard,
  type UnoColor
} from './cards'

const num = (color: UnoColor, value: number): UnoCard => ({
  id: `${color}${value}`,
  color,
  type: 'number',
  value
})

describe('deck composition', () => {
  const deck = createUnoDeck()

  it('has 108 cards', () => {
    expect(deck).toHaveLength(108)
  })

  it('has unique ids', () => {
    expect(new Set(deck.map((c) => c.id)).size).toBe(108)
  })

  it('has the standard per-colour distribution', () => {
    for (const color of UNO_COLORS) {
      const ofColor = deck.filter((c) => c.color === color)
      expect(ofColor).toHaveLength(25)
      // one 0
      expect(ofColor.filter((c) => c.type === 'number' && c.value === 0)).toHaveLength(1)
      // two each of 1-9
      for (let v = 1; v <= 9; v++) {
        expect(ofColor.filter((c) => c.type === 'number' && c.value === v)).toHaveLength(2)
      }
      // two each action
      expect(ofColor.filter((c) => c.type === 'skip')).toHaveLength(2)
      expect(ofColor.filter((c) => c.type === 'reverse')).toHaveLength(2)
      expect(ofColor.filter((c) => c.type === 'draw_two')).toHaveLength(2)
    }
  })

  it('has four wild and four wild-draw-four, all colourless', () => {
    expect(deck.filter((c) => c.type === 'wild')).toHaveLength(4)
    expect(deck.filter((c) => c.type === 'wild_draw_four')).toHaveLength(4)
    for (const c of deck.filter(isWild)) expect(c.color).toBeNull()
  })
})

describe('shuffle', () => {
  it('does not mutate its input and keeps the same multiset', () => {
    const deck = createUnoDeck()
    const before = deck.map((c) => c.id)
    const out = shuffle(deck)
    expect(deck.map((c) => c.id)).toEqual(before) // input untouched
    expect(new Set(out.map((c) => c.id))).toEqual(new Set(before)) // same cards
    expect(out).toHaveLength(deck.length)
  })
})

describe('matchesTop', () => {
  it('matches by colour', () => {
    expect(matchesTop(num('red', 5), num('red', 9), 'red')).toBe(true)
  })

  it('matches by number value across colours', () => {
    expect(matchesTop(num('blue', 7), num('red', 7), 'red')).toBe(true)
  })

  it('rejects a mismatch in both colour and value', () => {
    expect(matchesTop(num('blue', 3), num('red', 7), 'red')).toBe(false)
  })

  it('matches action cards by type across colours', () => {
    const redSkip: UnoCard = { id: 'rs', color: 'red', type: 'skip', value: null }
    const blueSkip: UnoCard = { id: 'bs', color: 'blue', type: 'skip', value: null }
    expect(matchesTop(blueSkip, redSkip, 'red')).toBe(true)
  })

  it('respects the active colour set by a previous wild', () => {
    const wildTop: UnoCard = { id: 'w', color: null, type: 'wild', value: null }
    // active colour green; a green card matches even though the top is colourless
    expect(matchesTop(num('green', 2), wildTop, 'green')).toBe(true)
    expect(matchesTop(num('red', 2), wildTop, 'green')).toBe(false)
  })

  it('wild cards always match', () => {
    const wild: UnoCard = { id: 'w', color: null, type: 'wild', value: null }
    const wd4: UnoCard = { id: 'w4', color: null, type: 'wild_draw_four', value: null }
    expect(matchesTop(wild, num('red', 1), 'red')).toBe(true)
    expect(matchesTop(wd4, num('red', 1), 'red')).toBe(true)
  })
})
