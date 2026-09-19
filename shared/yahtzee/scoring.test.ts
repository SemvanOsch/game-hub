import { describe, expect, it } from 'vitest'
import {
  UPPER_BONUS,
  calculatePossibleScores,
  calculateTotals,
  scoreCategory
} from './scoring'

describe('scoreCategory - upper section', () => {
  it('sums matching faces for number categories', () => {
    expect(scoreCategory('ones', [1, 1, 1, 5, 6])).toBe(3)
    expect(scoreCategory('twos', [2, 2, 3, 4, 2])).toBe(6)
    expect(scoreCategory('sixes', [6, 6, 6, 6, 6])).toBe(30)
    expect(scoreCategory('threes', [1, 2, 4, 5, 6])).toBe(0)
  })
})

describe('scoreCategory - three/four of a kind', () => {
  it('scores three of a kind as the sum of all dice', () => {
    expect(scoreCategory('threeOfAKind', [3, 3, 3, 4, 5])).toBe(18)
    expect(scoreCategory('threeOfAKind', [3, 3, 4, 4, 5])).toBe(0)
  })

  it('four of a kind also counts five of a kind', () => {
    expect(scoreCategory('fourOfAKind', [5, 5, 5, 5, 2])).toBe(22)
    expect(scoreCategory('fourOfAKind', [6, 6, 6, 6, 6])).toBe(30)
    expect(scoreCategory('fourOfAKind', [6, 6, 6, 1, 1])).toBe(0)
  })
})

describe('scoreCategory - full house', () => {
  it('awards 25 for a genuine full house', () => {
    expect(scoreCategory('fullHouse', [2, 2, 5, 5, 5])).toBe(25)
    expect(scoreCategory('fullHouse', [3, 3, 3, 6, 6])).toBe(25)
  })

  it('does not award a full house for other combinations', () => {
    expect(scoreCategory('fullHouse', [2, 2, 2, 2, 5])).toBe(0)
    expect(scoreCategory('fullHouse', [1, 1, 1, 1, 1])).toBe(0)
    expect(scoreCategory('fullHouse', [1, 2, 3, 4, 5])).toBe(0)
  })
})

describe('scoreCategory - straights', () => {
  it('awards 30 for a small straight (4 consecutive)', () => {
    expect(scoreCategory('smallStraight', [1, 2, 3, 4, 4])).toBe(30)
    expect(scoreCategory('smallStraight', [2, 3, 4, 5, 1])).toBe(30)
    expect(scoreCategory('smallStraight', [3, 4, 5, 6, 6])).toBe(30)
    expect(scoreCategory('smallStraight', [1, 1, 2, 3, 6])).toBe(0)
  })

  it('awards 40 for a large straight (5 consecutive)', () => {
    expect(scoreCategory('largeStraight', [1, 2, 3, 4, 5])).toBe(40)
    expect(scoreCategory('largeStraight', [2, 3, 4, 5, 6])).toBe(40)
    expect(scoreCategory('largeStraight', [1, 2, 3, 4, 6])).toBe(0)
  })
})

describe('scoreCategory - yahtzee & chance', () => {
  it('awards 50 for a yahtzee', () => {
    expect(scoreCategory('yahtzee', [4, 4, 4, 4, 4])).toBe(50)
    expect(scoreCategory('yahtzee', [4, 4, 4, 4, 5])).toBe(0)
  })

  it('chance is the sum of all dice', () => {
    expect(scoreCategory('chance', [1, 2, 3, 4, 5])).toBe(15)
    expect(scoreCategory('chance', [6, 6, 6, 6, 6])).toBe(30)
  })
})

describe('calculateTotals - upper bonus', () => {
  it('grants the 35-point bonus when the upper subtotal reaches 63', () => {
    const totals = calculateTotals({
      ones: 3,
      twos: 6,
      threes: 9,
      fours: 12,
      fives: 15,
      sixes: 18 // subtotal = 63
    })
    expect(totals.upperSubtotal).toBe(63)
    expect(totals.upperBonus).toBe(UPPER_BONUS)
    expect(totals.upperTotal).toBe(98)
    expect(totals.grandTotal).toBe(98)
  })

  it('does not grant the bonus below the threshold', () => {
    const totals = calculateTotals({ ones: 1, sixes: 18 })
    expect(totals.upperBonus).toBe(0)
  })

  it('adds lower-section scores into the grand total', () => {
    const totals = calculateTotals({ sixes: 18, yahtzee: 50, chance: 20 })
    expect(totals.lowerTotal).toBe(70)
    expect(totals.grandTotal).toBe(88)
  })
})

describe('calculatePossibleScores', () => {
  it('returns a score for every category', () => {
    const scores = calculatePossibleScores([5, 5, 5, 5, 5])
    expect(scores.yahtzee).toBe(50)
    expect(scores.fives).toBe(25)
    expect(scores.chance).toBe(25)
    expect(scores.smallStraight).toBe(0)
    expect(Object.keys(scores)).toHaveLength(13)
  })
})
