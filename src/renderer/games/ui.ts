/**
 * Client-side game UI registry. Maps a game id to the React components that
 * render its in-game and game-over screens. The launcher shell (`App.tsx`)
 * looks a game up here rather than hardcoding per-game branches, so adding a
 * game's UI is just registering it below.
 */
import type { ComponentType } from 'react'
import type { RoomState } from '@shared/types'
import { YahtzeeGame } from './yahtzee/YahtzeeGame'
import { YahtzeeResult } from './yahtzee/YahtzeeResult'
import { BattleshipsGame } from './battleships/BattleshipsGame'
import { BattleshipsResult } from './battleships/BattleshipsResult'
import { BlackjackGame } from './blackjack/BlackjackGame'
import { BlackjackResult } from './blackjack/BlackjackResult'
import { RummikubGame } from './rummikub/RummikubGame'
import { RummikubResult } from './rummikub/RummikubResult'

/** Props passed to a game's in-progress screen. */
export interface GameUIProps {
  room: RoomState
  /** The per-player, game-specific client view (cast by the component). */
  view: unknown
  selfId: string
  /** Send a game-specific action to the authoritative server. */
  sendAction: (action: unknown) => void
  onLeave: () => void
}

/** Props passed to a game's game-over screen. */
export interface GameOverUIProps {
  room: RoomState
  view: unknown
  results: unknown
  selfId: string
  isHost: boolean
  onPlayAgain: () => void
  onHome: () => void
}

export interface GameUI {
  Game: ComponentType<GameUIProps>
  GameOver: ComponentType<GameOverUIProps>
}

const GAME_UI: Record<string, GameUI> = {
  yahtzee: { Game: YahtzeeGame, GameOver: YahtzeeResult },
  battleships: { Game: BattleshipsGame, GameOver: BattleshipsResult },
  blackjack: { Game: BlackjackGame, GameOver: BlackjackResult },
  rummikub: { Game: RummikubGame, GameOver: RummikubResult }
}

export function getGameUI(gameId: string): GameUI | undefined {
  return GAME_UI[gameId]
}
