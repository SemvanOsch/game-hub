import { describe, it, expect } from 'vitest'
import { calculateSidePots, totalPot, type PlayerContribution } from './sidePots'

function contrib(playerId: string, contributed: number, folded = false): PlayerContribution {
  return { playerId, contributed, folded }
}

describe('calculateSidePots', () => {
  it('makes a single pot when everyone contributed equally', () => {
    const pots = calculateSidePots([contrib('a', 100), contrib('b', 100), contrib('c', 100)])
    expect(pots).toHaveLength(1)
    expect(pots[0]).toEqual({ amount: 300, eligiblePlayerIds: ['a', 'b', 'c'] })
  })

  it('builds a main pot and side pot for one short all-in', () => {
    // a all-in for 100, b and c continue to 300 each.
    const pots = calculateSidePots([contrib('a', 100), contrib('b', 300), contrib('c', 300)])
    expect(pots).toHaveLength(2)
    // Main pot: 100 from each of the three.
    expect(pots[0]).toEqual({ amount: 300, eligiblePlayerIds: ['a', 'b', 'c'] })
    // Side pot: 200 from each of b and c.
    expect(pots[1]).toEqual({ amount: 400, eligiblePlayerIds: ['b', 'c'] })
  })

  it('builds multiple side pots for three different all-in stacks', () => {
    // a all-in 100, b all-in 300, c invests 500.
    const pots = calculateSidePots([contrib('a', 100), contrib('b', 300), contrib('c', 500)])
    expect(pots).toHaveLength(3)
    expect(pots[0]).toEqual({ amount: 300, eligiblePlayerIds: ['a', 'b', 'c'] })
    expect(pots[1]).toEqual({ amount: 400, eligiblePlayerIds: ['b', 'c'] })
    expect(pots[2]).toEqual({ amount: 200, eligiblePlayerIds: ['c'] })
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(900)
  })

  it('keeps a folded player’s chips in the pot but not in the eligible set', () => {
    // b folded after putting in 300; a all-in 100; c to 300.
    const pots = calculateSidePots([contrib('a', 100), contrib('b', 300, true), contrib('c', 300)])
    // Main pot has all three levels of contribution but b is not eligible.
    expect(pots[0]).toEqual({ amount: 300, eligiblePlayerIds: ['a', 'c'] })
    expect(pots[1]).toEqual({ amount: 400, eligiblePlayerIds: ['c'] })
    expect(totalPot([contrib('a', 100), contrib('b', 300, true), contrib('c', 300)])).toBe(700)
  })

  it('ignores players who contributed nothing', () => {
    const pots = calculateSidePots([contrib('a', 50), contrib('b', 50), contrib('c', 0)])
    expect(pots).toHaveLength(1)
    expect(pots[0].eligiblePlayerIds).toEqual(['a', 'b'])
  })
})
