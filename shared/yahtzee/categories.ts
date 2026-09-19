/** All Yahtzee scoring categories, split into upper and lower sections. */

export const UPPER_CATEGORIES = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes'
] as const

export const LOWER_CATEGORIES = [
  'threeOfAKind',
  'fourOfAKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yahtzee',
  'chance'
] as const

export type UpperCategory = (typeof UPPER_CATEGORIES)[number]
export type LowerCategory = (typeof LOWER_CATEGORIES)[number]
export type Category = UpperCategory | LowerCategory

export const ALL_CATEGORIES: Category[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES]

/** Total number of scoring categories every player must fill to finish. */
export const CATEGORY_COUNT = ALL_CATEGORIES.length

/** Human-readable labels for UI rendering. */
export const CATEGORY_LABELS: Record<Category, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  threeOfAKind: 'Three of a Kind',
  fourOfAKind: 'Four of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Small Straight',
  largeStraight: 'Large Straight',
  yahtzee: 'Yahtzee',
  chance: 'Chance'
}

/** Short hint describing how each category scores. */
export const CATEGORY_HINTS: Record<Category, string> = {
  ones: 'Sum of all 1s',
  twos: 'Sum of all 2s',
  threes: 'Sum of all 3s',
  fours: 'Sum of all 4s',
  fives: 'Sum of all 5s',
  sixes: 'Sum of all 6s',
  threeOfAKind: 'Sum of all dice (if 3+ alike)',
  fourOfAKind: 'Sum of all dice (if 4+ alike)',
  fullHouse: '25 points',
  smallStraight: '30 points',
  largeStraight: '40 points',
  yahtzee: '50 points',
  chance: 'Sum of all dice'
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (ALL_CATEGORIES as string[]).includes(value)
}
