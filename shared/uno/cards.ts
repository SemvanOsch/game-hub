/**
 * Pure UNO card model, deck generation and shuffle.
 *
 * No React, no networking, no I/O beyond Math.random (deck shuffling). These
 * helpers are isomorphic: imported by the server (authoritative deck/rules) and
 * the renderer (card display). Keep them free of Node/browser-specific imports.
 *
 * A standard 108-card UNO deck is used (see {@link createUnoDeck}). Wild cards
 * carry `color: null` — the *chosen* colour after a wild is played lives in the
 * game's `activeColor`, never on the card itself, so a wild always reads back as
 * a wild.
 */

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue'

export type UnoCardType =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw_two'
  | 'wild'
  | 'wild_draw_four'

export interface UnoCard {
  /** Stable id, unique within a match (React key + action targeting). */
  id: string
  /** Colour for coloured cards; null for wild / wild-draw-four. */
  color: UnoColor | null
  type: UnoCardType
  /** 0–9 for number cards; null for every action/wild card. */
  value: number | null
}

export const UNO_COLORS: readonly UnoColor[] = ['red', 'yellow', 'green', 'blue']

/** True for the two wild card types (playable on any colour). */
export function isWild(card: UnoCard): boolean {
  return card.type === 'wild' || card.type === 'wild_draw_four'
}

/**
 * Build a fresh, ordered standard 108-card UNO deck. Composition per colour:
 *   - one 0
 *   - two each of 1–9
 *   - two Skip, two Reverse, two Draw Two
 * plus four Wild and four Wild Draw Four. Ids are assigned sequentially so every
 * card in the deck is uniquely addressable.
 */
export function createUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = []
  let seq = 0
  const push = (color: UnoColor | null, type: UnoCardType, value: number | null): void => {
    deck.push({ id: `u${seq++}`, color, type, value })
  }

  for (const color of UNO_COLORS) {
    // One 0, two of each 1–9.
    push(color, 'number', 0)
    for (let v = 1; v <= 9; v++) {
      push(color, 'number', v)
      push(color, 'number', v)
    }
    // Two each of the coloured action cards.
    for (const type of ['skip', 'reverse', 'draw_two'] as const) {
      push(color, type, null)
      push(color, type, null)
    }
  }

  // Four Wild and four Wild Draw Four.
  for (let i = 0; i < 4; i++) push(null, 'wild', null)
  for (let i = 0; i < 4; i++) push(null, 'wild_draw_four', null)

  return deck
}

/**
 * Return a new array shuffled with an unbiased Fisher–Yates shuffle. The input
 * is not mutated. The server calls this authoritatively; clients never decide
 * card order.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const out = input.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Whether `card` may legally be played on top of `top` given the current
 * `activeColor`. Pure matching rules (the Wild Draw Four "no matching colour in
 * hand" restriction is enforced separately in the engine, where the hand is
 * known):
 *   - Wild / Wild Draw Four: always match here.
 *   - Coloured card: matches when its colour equals the active colour, or it
 *     shares the top card's symbol (same number value, or same action type).
 */
export function matchesTop(card: UnoCard, top: UnoCard, activeColor: UnoColor): boolean {
  if (isWild(card)) return true
  if (card.color === activeColor) return true
  if (card.type === 'number' && top.type === 'number') {
    return card.value === top.value
  }
  // Action cards match another card of the same action type (any colour).
  if (card.type === top.type) return true
  return false
}
