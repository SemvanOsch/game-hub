/**
 * Pure Skip-Bo card model, deck generation, shuffle, and the positional
 * building-pile rules.
 *
 * No React, no networking, no I/O beyond Math.random (deck shuffling). These
 * helpers are isomorphic: imported by the server (authoritative deck/rules) and
 * the renderer (card display + legal-move hints). Keep them free of Node/browser
 * specific imports.
 *
 * A standard 162-card Skip-Bo deck is used (see {@link createSkipBoDeck}):
 *   - 144 number cards: twelve copies each of the values 1–12
 *   - 18 Skip-Bo wild cards
 * Every physical card carries a unique `id` (React key + action targeting).
 */

/** The value range printed on number cards. */
export const MIN_VALUE = 1
export const MAX_VALUE = 12

/** A single Skip-Bo card. Wilds have `type: 'skipbo'` and `value: null`. */
export interface SkipBoCard {
  /** Stable id, unique within a match. */
  id: string
  type: 'number' | 'skipbo'
  /** 1–12 for number cards; null for Skip-Bo wilds. */
  value: number | null
}

/**
 * A card sitting on a building pile. `playedAs` is the effective value the card
 * represents at its position (equal to `value` for numbers, and the chosen value
 * for a Skip-Bo wild). The original card is left untouched — a wild always reads
 * back as a wild via `type`/`value`; `playedAs` only records what it stands in for.
 */
export interface BuildingCard extends SkipBoCard {
  playedAs: number
}

/** True for Skip-Bo wild cards (playable as any required value). */
export function isSkipBo(card: SkipBoCard): boolean {
  return card.type === 'skipbo'
}

/**
 * Build a fresh, ordered standard 162-card Skip-Bo deck: twelve of each 1–12,
 * plus eighteen Skip-Bo wilds. Ids are assigned sequentially so every card in
 * the deck is uniquely addressable.
 */
export function createSkipBoDeck(): SkipBoCard[] {
  const deck: SkipBoCard[] = []
  let seq = 0
  for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
    for (let i = 0; i < 12; i++) {
      deck.push({ id: `s${seq++}`, type: 'number', value })
    }
  }
  for (let i = 0; i < 18; i++) {
    deck.push({ id: `s${seq++}`, type: 'skipbo', value: null })
  }
  return deck
}

/**
 * Return a new array shuffled with an unbiased Fisher–Yates shuffle. The input
 * is not mutated. The server calls this authoritatively; clients never decide
 * card order.
 */
export function shuffle<T>(input: readonly T[], rng: () => number = Math.random): T[] {
  const out = input.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The value a building pile of length `n` next requires: an empty pile needs a 1,
 * a pile whose top is `k` needs `k + 1`. A pile builds 1→12, so its length equals
 * the value of its top card. Returns 13 for a full (about-to-complete) pile.
 */
export function requiredValue(pileLength: number): number {
  return pileLength + 1
}

/**
 * Whether `card` may be legally played to satisfy `required` (1–12). Skip-Bo
 * wilds satisfy any required value; number cards must match exactly. This is the
 * single source of building-pile legality, shared by the authoritative reducer
 * and the client's move hints.
 */
export function cardSatisfies(card: SkipBoCard, required: number): boolean {
  if (required < MIN_VALUE || required > MAX_VALUE) return false
  if (isSkipBo(card)) return true
  return card.value === required
}
