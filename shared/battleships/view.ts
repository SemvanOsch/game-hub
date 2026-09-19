/**
 * Client-facing (sanitized) Battleships types and the state serializer.
 *
 * SECURITY: the authoritative {@link BattleshipsGameState} contains BOTH fleets
 * in full. A client must never receive the positions of the opponent's *unsunk*
 * ships. {@link getPlayerView} is the single choke point that strips hidden
 * information — the renderer only ever sees a {@link BattleshipsView}.
 */
import type { BattleshipsGameState, LastShotEvent } from './engine'
import { isFleetSunk } from './engine'
import { SHIP_DEFINITIONS, type Ship, type ShipType, type Shot } from './types'

/** The local player's own board — full knowledge of their own fleet. */
export interface OwnBoardView {
  ships: Ship[]
  /** Shots the opponent has fired at this board (their hits and misses). */
  shots: Shot[]
}

/** The opponent's board — only what the local player is allowed to know. */
export interface EnemyBoardView {
  /** Shots the local player has fired at the enemy, with hit/miss outcome. */
  shots: Shot[]
  /**
   * Enemy ships whose positions the local player is allowed to see: sunk ships
   * during play, and the entire fleet once the game is finished.
   */
  revealedShips: Ship[]
}

/** Compact fleet status entry. For the enemy, only `sunk` is ever revealed. */
export interface FleetStatusEntry {
  type: ShipType
  name: string
  length: number
  sunk: boolean
}

export interface BattleshipsView {
  status: 'playing' | 'finished'
  selfId: string
  opponentId: string | null
  currentPlayerId: string
  yourTurn: boolean
  own: OwnBoardView
  enemy: EnemyBoardView
  ownFleet: FleetStatusEntry[]
  enemyFleet: FleetStatusEntry[]
  winnerId?: string
  lastShot?: LastShotEvent
}

export interface BattleshipsResults {
  winnerId?: string
}

function fleetStatus(ships: Ship[]): FleetStatusEntry[] {
  // Render in canonical order regardless of internal storage order.
  return SHIP_DEFINITIONS.map((def) => {
    const ship = ships.find((s) => s.type === def.type)
    return {
      type: def.type,
      name: def.name,
      length: def.length,
      sunk: ship?.sunk ?? false
    }
  })
}

/**
 * Produce the safe, player-specific view of the authoritative game state.
 * Hidden opponent ship positions are simply not included in the output.
 */
export function getPlayerView(
  state: BattleshipsGameState,
  playerId: string
): BattleshipsView {
  const opponentId = state.playerOrder.find((id) => id !== playerId) ?? null
  const ownBoard = state.boards[playerId]
  const enemyBoard = opponentId ? state.boards[opponentId] : undefined

  const finished = state.status === 'finished'

  const enemyShips = enemyBoard?.ships ?? []
  // Only reveal enemy ship positions for sunk ships (or all once finished).
  const revealedShips: Ship[] = enemyShips.filter((s) => finished || s.sunk)

  return {
    status: state.status,
    selfId: playerId,
    opponentId,
    currentPlayerId: state.playerOrder[state.currentPlayerIndex],
    yourTurn: state.status === 'playing' && state.playerOrder[state.currentPlayerIndex] === playerId,
    own: {
      ships: ownBoard?.ships ?? [],
      shots: ownBoard?.shots ?? []
    },
    enemy: {
      shots: enemyBoard?.shots ?? [],
      revealedShips
    },
    ownFleet: fleetStatus(ownBoard?.ships ?? []),
    enemyFleet: fleetStatus(enemyShips),
    winnerId: state.winnerId,
    lastShot: state.lastShot
  }
}

export function getResults(state: BattleshipsGameState): BattleshipsResults {
  return { winnerId: state.winnerId }
}

export { isFleetSunk }
