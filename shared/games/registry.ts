/**
 * Server/shared engine registry. Maps a game id to its {@link GameEngine}.
 *
 * This is the single dispatch point the multiplayer core uses to run any game.
 * Adding a game is: implement its engine, then register it here. No other part
 * of the server needs to know the game exists.
 */
import type { GameEngine } from './types'
import { yahtzeeEngine } from '../yahtzee/game'
import { battleshipsEngine } from '../battleships/game'
import { blackjackEngine } from '../blackjack/game'
import { rummikubEngine } from '../rummikub/game'
import { connect4Engine } from '../connect4/game'
import { pokerEngine } from '../poker/game'
import { unoEngine } from '../uno/game'
import { zipEngine } from '../zip/game'

const ENGINES: Record<string, GameEngine> = {
  [yahtzeeEngine.id]: yahtzeeEngine,
  [battleshipsEngine.id]: battleshipsEngine,
  [blackjackEngine.id]: blackjackEngine,
  [rummikubEngine.id]: rummikubEngine,
  [connect4Engine.id]: connect4Engine,
  [pokerEngine.id]: pokerEngine,
  [unoEngine.id]: unoEngine,
  [zipEngine.id]: zipEngine
}

export function getEngine(id: string): GameEngine | undefined {
  return ENGINES[id]
}

export function isKnownGame(id: string): boolean {
  return id in ENGINES
}

export const DEFAULT_GAME_ID = yahtzeeEngine.id
