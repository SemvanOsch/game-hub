/**
 * Game registry. The home screen renders from this list, so adding a new game
 * is a matter of implementing its screens and appending an entry here — no
 * changes to the launcher shell required.
 */
import type { ComponentType } from 'react'
import { RummikubIcon } from './rummikub/RummikubIcon'
import { Connect4Icon } from './connect4/Connect4Icon'
import { PokerIcon } from './poker/PokerIcon'

export interface GameDefinition {
  id: string
  name: string
  description: string
  /** Emoji or short glyph used as the card icon (fallback when no `Icon`). */
  icon: string
  /** Optional custom graphical icon component, preferred over `icon` when set. */
  Icon?: ComponentType
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
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    description:
      'Beat the dealer and outlast your opponents. First to 1,000 chips — or the last player standing — wins the match.',
    icon: '🃏',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 6,
    available: true
  },
  {
    id: 'rummikub',
    name: 'Rummikub',
    description: 'Classic tile-based strategy game for 2–4 players.',
    icon: '',
    Icon: RummikubIcon,
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 4,
    available: true
  },
  {
    id: 'connect4',
    name: 'Connect 4',
    description: 'Classic four-in-a-row strategy game for 2 players.',
    icon: '',
    Icon: Connect4Icon,
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 2,
    available: true
  },
  {
    id: 'poker',
    name: 'Texas Hold’em',
    description:
      'No-Limit poker for 2–8. Outlast the table — last player with chips wins. Blinds, side pots and showdowns included.',
    icon: '',
    Icon: PokerIcon,
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 8,
    available: true
  }
]

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
