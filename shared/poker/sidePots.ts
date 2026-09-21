/**
 * Pure side-pot construction for No-Limit Hold'em.
 *
 * When players are all-in for different amounts, the pot splits into a main pot
 * and one or more side pots. Each pot can only be won by players who contributed
 * to it (folded players' chips stay in the pots but they can never win a share).
 *
 * This module is deliberately independent of the engine and of hand evaluation:
 * it turns per-player contributions into a list of pots with eligible players.
 * Deciding the *winner* of each pot happens in the engine using the hand
 * evaluator; this only decides the pot *structure*.
 */

export interface PlayerContribution {
  playerId: string
  /** Total chips this player put into the pot across the whole hand. */
  contributed: number
  /** Folded players' chips remain in the pot but they cannot win any share. */
  folded: boolean
}

export interface Pot {
  /** Total chips in this pot. */
  amount: number
  /** Ids of players eligible to win this pot (contributed enough AND not folded). */
  eligiblePlayerIds: string[]
}

/**
 * Build the ordered list of pots (main pot first, then side pots) from every
 * player's total contribution. Chips from folded players are included in the pot
 * amounts but folded players never appear in any `eligiblePlayerIds`.
 *
 * Algorithm: process distinct contribution levels low→high. Each level forms a
 * "layer": every player who reached that level pays the layer's width into it,
 * and only the non-folded contributors at that level can win it. Adjacent layers
 * with the identical eligible set are merged so the result reads as the familiar
 * main-pot / side-pot list.
 */
export function calculateSidePots(contributions: PlayerContribution[]): Pot[] {
  const withChips = contributions.filter((c) => c.contributed > 0)
  if (withChips.length === 0) return []

  const levels = [...new Set(withChips.map((c) => c.contributed))].sort((a, b) => a - b)

  const pots: Pot[] = []
  let previousLevel = 0
  for (const level of levels) {
    const width = level - previousLevel
    const contributorsAtLevel = withChips.filter((c) => c.contributed >= level)
    const amount = width * contributorsAtLevel.length
    const eligible = contributorsAtLevel.filter((c) => !c.folded).map((c) => c.playerId)

    if (amount > 0) {
      const last = pots[pots.length - 1]
      // Merge into the previous pot when the eligible set is identical.
      if (last && sameMembers(last.eligiblePlayerIds, eligible)) {
        last.amount += amount
      } else {
        pots.push({ amount, eligiblePlayerIds: eligible })
      }
    }
    previousLevel = level
  }

  return pots
}

function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/** The grand total across all pots (== sum of every contribution). */
export function totalPot(contributions: PlayerContribution[]): number {
  return contributions.reduce((sum, c) => sum + c.contributed, 0)
}
