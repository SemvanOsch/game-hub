/**
 * Pure, isomorphic helpers for representing a numeric chip amount as a small set
 * of casino chip denominations. This is a PRESENTATION concern only: nothing here
 * feeds back into the Blackjack economy — the numeric balance stays authoritative.
 * The helpers are game-agnostic (no Blackjack imports) so future card games can
 * reuse them, and they live under `shared/` purely so they are unit-testable.
 *
 * No React, no browser/Node imports — keep it that way.
 */

/** Chip denominations, largest first. Includes 1 so every whole amount is exact. */
export const CHIP_DENOMINATIONS = [500, 100, 25, 5, 1] as const
export type ChipDenomination = (typeof CHIP_DENOMINATIONS)[number]

export interface ChipBreakdownEntry {
  denomination: ChipDenomination
  count: number
}

/**
 * Greedily decompose a whole chip amount into denomination counts, largest
 * first. Guarantees:
 * - only positive counts are returned (no zero/negative entries),
 * - only valid {@link CHIP_DENOMINATIONS} appear,
 * - the counts sum back to `floor(max(0, amount))` exactly.
 *
 * Fractional inputs (possible from an odd 3:2 all-in payout, e.g. 187.5) are
 * floored for the visual decomposition; the exact numeric value is still shown
 * as the label by the UI, so no precision is lost to the player.
 */
export function getChipBreakdown(amount: number): ChipBreakdownEntry[] {
  let remaining = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0
  const out: ChipBreakdownEntry[] = []
  for (const denomination of CHIP_DENOMINATIONS) {
    const count = Math.floor(remaining / denomination)
    if (count > 0) {
      out.push({ denomination, count })
      remaining -= count * denomination
    }
  }
  return out
}

/** The total number of physical chips a breakdown represents. */
export function totalChipCount(breakdown: ChipBreakdownEntry[]): number {
  return breakdown.reduce((sum, e) => sum + e.count, 0)
}

/** A single visual column (stack) of same-denomination chips. */
export interface ChipColumn {
  denomination: ChipDenomination
  /** Chips actually drawn in this column (already bounded). */
  count: number
}

export interface ChipColumnOptions {
  /** Maximum number of columns to draw (older/smaller denominations are dropped). */
  maxColumns: number
  /** Maximum chips drawn per column before spilling into a new column. */
  maxPerColumn: number
}

/**
 * Plan a BOUNDED set of chip columns for an amount: each denomination fills one
 * or more columns of at most `maxPerColumn` chips, and the whole plan is capped
 * at `maxColumns` columns (largest, most visually significant denominations kept
 * first). This keeps the rendered chip count small no matter how large the
 * balance grows — the exact value always travels alongside as a numeric label.
 */
export function planChipColumns(amount: number, options: ChipColumnOptions): ChipColumn[] {
  const maxColumns = Math.max(0, Math.floor(options.maxColumns))
  const maxPerColumn = Math.max(1, Math.floor(options.maxPerColumn))
  const columns: ChipColumn[] = []
  for (const { denomination, count } of getChipBreakdown(amount)) {
    let left = count
    while (left > 0 && columns.length < maxColumns) {
      const drawn = Math.min(left, maxPerColumn)
      columns.push({ denomination, count: drawn })
      left -= drawn
    }
    if (columns.length >= maxColumns) break
  }
  return columns
}

/**
 * Plan a single MIXED column (a small betting pile): the breakdown's chips are
 * stacked in one column, largest denomination at the bottom, bounded to
 * `maxChips`. Used for compact spots like a hand's current bet.
 */
export function planMixedColumn(amount: number, maxChips: number): ChipDenomination[] {
  const cap = Math.max(1, Math.floor(maxChips))
  const chips: ChipDenomination[] = []
  for (const { denomination, count } of getChipBreakdown(amount)) {
    for (let i = 0; i < count; i++) {
      chips.push(denomination)
      if (chips.length >= cap) return chips
    }
  }
  return chips
}
