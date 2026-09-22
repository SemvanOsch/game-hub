/**
 * Game registry. The home screen renders from this list, so adding a new game
 * is a matter of implementing its screens and appending an entry here — no
 * changes to the launcher shell required.
 */
import type { ComponentType } from 'react'
import { RummikubIcon } from './rummikub/RummikubIcon'
import { Connect4Icon } from './connect4/Connect4Icon'
import { PokerIcon } from './poker/PokerIcon'
import { UnoIcon } from './uno/UnoIcon'

export interface GameDefinition {
  id: string
  name: string
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
    icon: '🎲',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 6,
    available: true
  },
  {
    id: 'battleships',
    name: 'Battleships',
    icon: '🚢',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 2,
    available: true
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    icon: '🃏',
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 6,
    available: true
  },
  {
    id: 'rummikub',
    name: 'Rummikub',
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
    icon: '',
    Icon: Connect4Icon,
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 2,
    available: true
  },
  {
    id: 'poker',
    name: 'Poker',
    icon: '',
    Icon: PokerIcon,
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 8,
    available: true
  },
  {
    id: 'uno',
    name: 'UNO',
    icon: '',
    Icon: UnoIcon,
    multiplayer: true,
    minPlayers: 2,
    maxPlayers: 8,
    available: true
  }
]

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
