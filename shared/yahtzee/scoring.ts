import {
  ALL_CATEGORIES,
  UPPER_CATEGORIES,
  type Category,
  type UpperCategory
} from './categories'

/** Points awarded for the upper-section bonus. */
export const UPPER_BONUS = 35
/** Upper-section subtotal required to earn the bonus. */
export const UPPER_BONUS_THRESHOLD = 63

const FULL_HOUSE_SCORE = 25
const SMALL_STRAIGHT_SCORE = 30
const LARGE_STRAIGHT_SCORE = 40
const YAHTZEE_SCORE = 50

/** Count occurrences of each die face (1..6). Returns index 1..6. */
function faceCounts(dice: number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const d of dice) {
    if (d >= 1 && d <= 6) counts[d]++
  }
  return counts
}

const UPPER_FACE: Record<UpperCategory, number> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6
}

function sum(dice: number[]): number {
  return dice.reduce((a, b) => a + b, 0)
}

function hasNOfAKind(dice: number[], n: number): boolean {
  return faceCounts(dice).some((c) => c >= n)
}

function isFullHouse(dice: number[]): boolean {
  const counts = faceCounts(dice).filter((c) => c > 0).sort((a, b) => a - b)
  // Exactly a triple and a pair of different faces.
  return counts.length === 2 && counts[0] === 2 && counts[1] === 3
}

function longestStraight(dice: number[]): number {
  const present = new Set(dice)
  let best = 0
  let run = 0
  for (let face = 1; face <= 6; face++) {
    if (present.has(face)) {
      run++
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  return best
}

/**
 * Score a single category for a given set of dice.
 * This is the authoritative rule implementation — it does NOT know about
 * which categories are already used; the engine enforces that.
 */
export function scoreCategory(category: Category, dice: number[]): number {
  switch (category) {
    case 'ones':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const face = UPPER_FACE[category]
      return dice.filter((d) => d === face).length * face
    }
    case 'threeOfAKind':
      return hasNOfAKind(dice, 3) ? sum(dice) : 0
    case 'fourOfAKind':
      return hasNOfAKind(dice, 4) ? sum(dice) : 0
    case 'fullHouse':
      return isFullHouse(dice) ? FULL_HOUSE_SCORE : 0
    case 'smallStraight':
      return longestStraight(dice) >= 4 ? SMALL_STRAIGHT_SCORE : 0
    case 'largeStraight':
      return longestStraight(dice) >= 5 ? LARGE_STRAIGHT_SCORE : 0
    case 'yahtzee':
      return hasNOfAKind(dice, 5) ? YAHTZEE_SCORE : 0
    case 'chance':
      return sum(dice)
    default: {
      // Exhaustiveness guard.
      const _never: never = category
      return _never
    }
  }
}

/** Score every category for the given dice (used for UI previews). */
export function calculatePossibleScores(dice: number[]): Record<Category, number> {
  const result = {} as Record<Category, number>
  for (const category of ALL_CATEGORIES) {
    result[category] = scoreCategory(category, dice)
  }
  return result
}

export interface ScoreTotals {
  upperSubtotal: number
  upperBonus: number
  upperTotal: number
  lowerTotal: number
  grandTotal: number
}

/**
 * Compute section subtotals, upper bonus and grand total from a (possibly
 * partial) scorecard mapping categories to points.
 */
export function calculateTotals(scores: Partial<Record<Category, number>>): ScoreTotals {
  let upperSubtotal = 0
  let lowerTotal = 0

  for (const category of ALL_CATEGORIES) {
    const value = scores[category]
    if (value === undefined) continue
    if ((UPPER_CATEGORIES as readonly string[]).includes(category)) {
      upperSubtotal += value
    } else {
      lowerTotal += value
    }
  }

  const upperBonus = upperSubtotal >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0
  const upperTotal = upperSubtotal + upperBonus
  return {
    upperSubtotal,
    upperBonus,
    upperTotal,
    lowerTotal,
    grandTotal: upperTotal + lowerTotal
  }
}
