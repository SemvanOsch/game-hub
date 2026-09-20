import { describe, expect, it } from 'vitest'
import {
  CHIP_DENOMINATIONS,
  getChipBreakdown,
  planChipColumns,
  planMixedColumn,
  totalChipCount,
  type ChipBreakdownEntry
} from './breakdown'

const DENOMS = new Set<number>(CHIP_DENOMINATIONS)

/** Sum an amount back from its breakdown entries. */
function sumOf(breakdown: ChipBreakdownEntry[]): number {
  return breakdown.reduce((s, e) => s + e.denomination * e.count, 0)
}

describe('getChipBreakdown', () => {
  // The amounts the task explicitly calls out, plus edge values.
  const cases = [0, 1, 5, 25, 75, 99, 100, 125, 250, 375, 500, 999, 1000]

  it('produces only valid denominations and non-negative counts', () => {
    for (const amount of cases) {
      for (const entry of getChipBreakdown(amount)) {
        expect(DENOMS.has(entry.denomination)).toBe(true)
        expect(entry.count).toBeGreaterThan(0) // no zero/negative entries
        expect(Number.isInteger(entry.count)).toBe(true)
      }
    }
  })

  it('always sums back to the (floored) original amount', () => {
    for (const amount of cases) {
      expect(sumOf(getChipBreakdown(amount))).toBe(amount)
    }
  })

  it('uses a greedy largest-first decomposition', () => {
    expect(getChipBreakdown(500)).toEqual([{ denomination: 500, count: 1 }])
    expect(getChipBreakdown(375)).toEqual([
      { denomination: 100, count: 3 },
      { denomination: 25, count: 3 }
    ])
    expect(getChipBreakdown(75)).toEqual([{ denomination: 25, count: 3 }])
    expect(getChipBreakdown(1)).toEqual([{ denomination: 1, count: 1 }])
    expect(getChipBreakdown(999)).toEqual([
      { denomination: 500, count: 1 },
      { denomination: 100, count: 4 },
      { denomination: 25, count: 3 },
      { denomination: 5, count: 4 },
      { denomination: 1, count: 4 }
    ])
    expect(getChipBreakdown(1000)).toEqual([{ denomination: 500, count: 2 }])
  })

  it('returns nothing for zero and clamps negatives', () => {
    expect(getChipBreakdown(0)).toEqual([])
    expect(getChipBreakdown(-50)).toEqual([])
  })

  it('floors fractional amounts (e.g. an odd all-in blackjack payout)', () => {
    // 187.5 chips -> visualised as 187; the exact value is shown as the label.
    const b = getChipBreakdown(187.5)
    expect(sumOf(b)).toBe(187)
    expect(b.every((e) => Number.isInteger(e.count))).toBe(true)
  })
})

describe('planChipColumns (bounded pile)', () => {
  it('never exceeds the column or per-column caps, even for huge amounts', () => {
    const cols = planChipColumns(50_000, { maxColumns: 4, maxPerColumn: 5 })
    expect(cols.length).toBeLessThanOrEqual(4)
    for (const c of cols) {
      expect(c.count).toBeLessThanOrEqual(5)
      expect(c.count).toBeGreaterThan(0)
      expect(DENOMS.has(c.denomination)).toBe(true)
    }
  })

  it('splits a denomination across columns when it overflows one', () => {
    // 5000 = ten 500-chips -> with 5 per column that is two full columns.
    const cols = planChipColumns(5000, { maxColumns: 4, maxPerColumn: 5 })
    expect(cols).toEqual([
      { denomination: 500, count: 5 },
      { denomination: 500, count: 5 }
    ])
  })

  it('keeps the largest denominations first when capped', () => {
    const cols = planChipColumns(999, { maxColumns: 2, maxPerColumn: 5 })
    expect(cols.length).toBe(2)
    expect(cols[0].denomination).toBe(500)
    expect(cols[1].denomination).toBe(100)
  })

  it('is empty for zero', () => {
    expect(planChipColumns(0, { maxColumns: 4, maxPerColumn: 5 })).toEqual([])
  })
})

describe('planMixedColumn (compact bet pile)', () => {
  it('stacks largest-first and stays within the cap', () => {
    expect(planMixedColumn(100, 6)).toEqual([100])
    expect(planMixedColumn(75, 6)).toEqual([25, 25, 25])
    // 65 = 25,25,5,5,5
    expect(planMixedColumn(65, 6)).toEqual([25, 25, 5, 5, 5])
  })

  it('bounds the number of chips it returns', () => {
    const chips = planMixedColumn(9999, 6)
    expect(chips.length).toBeLessThanOrEqual(6)
  })

  it('is empty for zero', () => {
    expect(planMixedColumn(0, 6)).toEqual([])
  })
})

describe('totalChipCount', () => {
  it('counts every chip in a breakdown', () => {
    expect(totalChipCount(getChipBreakdown(375))).toBe(6) // 3 + 3
    expect(totalChipCount(getChipBreakdown(0))).toBe(0)
  })
})
