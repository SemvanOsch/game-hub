/**
 * Game registry. The home screen renders from this list, so adding a new game
 * is a matter of implementing its screens and appending an entry here — no
 * changes to the launcher shell required.
 */
export interface GameDefinition {
  id: string
  name: string
  description: string
  /** Emoji or short glyph used as the card icon. */
  icon: string
  /** Whether the game supports multiplayer over the network. */
  multiplayer: boolean
  /** Min/max players for a multiplayer session. */
  minPlayers: number
  maxPlayers: number
  /** false hides the Play button (e.g. "coming soon" placeholders). */
  available: boolean
}

export const GAMES: GameDefinition[] = [
  {
    id: 'yahtzee',
    name: 'Yahtzee',
    description: 'The classic dice game. Roll, hold, and score across 13 categories to claim the highest total.',
    icon: '🎲',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 6,
    available: true
  },
  {
    id: 'battleships',
    name: 'Battleships',
    description: "Find and sink your opponent's fleet. Fire across a 10×10 grid in this 1v1 naval duel.",
    icon: '🚢',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 2,
    available: true
  }
]

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
