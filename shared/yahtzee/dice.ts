/** Pure dice helpers. Randomness is isolated here so the rest of the engine
 *  stays deterministic and easy to test. */

export const DICE_COUNT = 5
export const MAX_ROLLS = 3

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6

function rollOne(): DieValue {
  return (Math.floor(Math.random() * 6) + 1) as DieValue
}

/** Roll a fresh set of five dice. */
export function rollDice(count: number = DICE_COUNT): number[] {
  return Array.from({ length: count }, rollOne)
}

/**
 * Reroll only the dice that are not held.
 * `dice` and `held` must be the same length; held dice keep their value.
 */
export function rerollDice(dice: number[], held: boolean[]): number[] {
  return dice.map((value, i) => (held[i] ? value : rollOne()))
}
