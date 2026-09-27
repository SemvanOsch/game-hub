/**
 * Pure Beverbende card model, deck generation and shuffle.
 *
 * No React, no networking, no I/O beyond an injectable rng (deck shuffling).
 * These helpers are isomorphic: imported by the server (authoritative deck/rules)
 * and the renderer (card display). Keep them free of Node/browser-specific imports.
 *
 * Verified 66-card deck (see `RULES.md`):
 *   - number cards (45): values 0–8 four copies each (36) + nine 9s (9)
 *   - special cards (21): 9 swap, 7 peek, 5 draw-two
 * Every physical card carries a unique `id` (React key + action targeting).
 */

/** The three special ("power") card kinds. Worth 0 points; replaced at scoring. */
export type SpecialKind = 'peek' | 'swap' | 'drawTwo'

/** A single Beverbende card. Numbers carry a 0–9 value; specials carry a kind. */
export type BeverbendeCard =
  | { id: string; type: 'number'; value: number }
  | { id: string; type: 'peek' }
  | { id: string; type: 'swap' }
  | { id: string; type: 'drawTwo' }

/** The value range printed on number cards. */
export const MIN_VALUE = 0
export const MAX_VALUE = 9

/** Deck composition constants (see `RULES.md`). */
export const LOW_VALUE_COPIES = 4 // copies of each value 0–8
export const NINE_COPIES = 9 // copies of the value 9
export const SWAP_COPIES = 9
export const PEEK_COPIES = 7
export const DRAW_TWO_COPIES = 5

/** Total number cards (45) and total deck size (66) — asserted by the tests. */
export const NUMBER_CARD_COUNT = MAX_VALUE * LOW_VALUE_COPIES + NINE_COPIES // 9*4 + 9 = 45
export const SPECIAL_CARD_COUNT = SWAP_COPIES + PEEK_COPIES + DRAW_TWO_COPIES // 21
export const DECK_SIZE = NUMBER_CARD_COUNT + SPECIAL_CARD_COUNT // 66

export function isSpecial(card: BeverbendeCard): boolean {
  return card.type !== 'number'
}

export function isNumber(card: BeverbendeCard): card is Extract<BeverbendeCard, { type: 'number' }> {
  return card.type === 'number'
}

/** Point value a card contributes at scoring (specials are 0 before replacement). */
export function cardPoints(card: BeverbendeCard): number {
  return card.type === 'number' ? card.value : 0
}

/**
 * Build a fresh, ordered standard 66-card Beverbende deck. Ids are assigned
 * sequentially so every card is uniquely addressable within a match.
 */
export function createBeverbendeDeck(): BeverbendeCard[] {
  const deck: BeverbendeCard[] = []
  let seq = 0
  // Values 0–8: four copies each.
  for (let value = MIN_VALUE; value < MAX_VALUE; value++) {
    for (let i = 0; i < LOW_VALUE_COPIES; i++) {
      deck.push({ id: `b${seq++}`, type: 'number', value })
    }
  }
  // Value 9: nine copies (deliberately over-represented — the card to avoid).
  for (let i = 0; i < NINE_COPIES; i++) {
    deck.push({ id: `b${seq++}`, type: 'number', value: MAX_VALUE })
  }
  for (let i = 0; i < SWAP_COPIES; i++) deck.push({ id: `b${seq++}`, type: 'swap' })
  for (let i = 0; i < PEEK_COPIES; i++) deck.push({ id: `b${seq++}`, type: 'peek' })
  for (let i = 0; i < DRAW_TWO_COPIES; i++) deck.push({ id: `b${seq++}`, type: 'drawTwo' })
  return deck
}

/**
 * Return a new array shuffled with an unbiased Fisher–Yates shuffle. The input is
 * not mutated. The server calls this authoritatively; clients never decide order.
 */
export function shuffle<T>(input: readonly T[], rng: () => number = Math.random): T[] {
  const out = input.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
