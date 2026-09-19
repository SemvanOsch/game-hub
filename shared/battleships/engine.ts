/**
 * Pure Battleships rules — no React, no networking, no I/O beyond Math.random.
 *
 * The authoritative game state ({@link BattleshipsGameState}) holds both fleets
 * in full, including hidden ship positions. Never send it to a client directly;
 * use `getPlayerView` (see `game.ts`) to produce a sanitized per-player view.
 */
import {
  BOARD_SIZE,
  SHIP_DEFINITIONS,
  coordinateKey,
  coordinatesEqual,
  isInsideBoard,
  type Coordinate,
  type Orientation,
  type Ship,
  type ShipType,
  type Shot,
  type ShotResult
} from './types'

/** A single player's fleet plus the shots the opponent has fired at it. */
export interface BattleshipsBoard {
  ships: Ship[]
  /** Shots fired AT this board (i.e. by the opponent). */
  shots: Shot[]
}

export interface LastShotEvent {
  /** Player id who fired the shot. */
  by: string
  coordinate: Coordinate
  result: ShotResult
  /** Set only when this shot sank a ship. */
  sunkShipType?: ShipType
}

/** Authoritative server state. Contains hidden information for both players. */
export interface BattleshipsGameState {
  status: 'playing' | 'finished'
  playerOrder: string[]
  currentPlayerIndex: number
  boards: Record<string, BattleshipsBoard>
  winnerId?: string
  /** The most recent shot, surfaced to clients for shot feedback. */
  lastShot?: LastShotEvent
}

export type ActionErrorCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER'

export type ActionResult =
  | { ok: true; state: BattleshipsGameState }
  | { ok: false; code: ActionErrorCode; message: string }

function fail(code: ActionErrorCode, message: string): ActionResult {
  return { ok: false, code, message }
}

const MAX_PLACEMENT_ATTEMPTS = 200
const MAX_FLEET_ATTEMPTS = 50

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive)
}

/** Compute the cells a ship of `length` would occupy from a start coordinate. */
function shipCells(start: Coordinate, length: number, orientation: Orientation): Coordinate[] {
  const cells: Coordinate[] = []
  for (let i = 0; i < length; i++) {
    cells.push({
      row: orientation === 'vertical' ? start.row + i : start.row,
      col: orientation === 'horizontal' ? start.col + i : start.col
    })
  }
  return cells
}

/**
 * Whether a set of candidate cells forms a legal placement: every cell inside
 * the board and none already occupied.
 */
export function isValidShipPlacement(
  cells: Coordinate[],
  occupied: ReadonlySet<string>
): boolean {
  for (const cell of cells) {
    if (!isInsideBoard(cell)) return false
    if (occupied.has(coordinateKey(cell))) return false
  }
  return true
}

/** An empty board with no ships and no shots taken. */
export function createBoard(): BattleshipsBoard {
  return { ships: [], shots: [] }
}

/**
 * Generate a random, valid fleet using the canonical ship definitions.
 *
 * Algorithm: place ships largest-first; for each ship pick a random orientation
 * and start until a non-overlapping in-bounds placement is found. If a ship
 * cannot be placed within the attempt limit, discard and restart the whole
 * fleet. This is guaranteed to terminate (bounded attempts) and, for the small
 * 10x10 fleet, effectively always succeeds on the first pass.
 */
export function generateRandomFleet(): Ship[] {
  for (let fleetAttempt = 0; fleetAttempt < MAX_FLEET_ATTEMPTS; fleetAttempt++) {
    const ships: Ship[] = []
    const occupied = new Set<string>()
    let ok = true

    // Descending size: harder-to-place ships go down first.
    const ordered = [...SHIP_DEFINITIONS].sort((a, b) => b.length - a.length)

    for (const def of ordered) {
      let placed = false
      for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
        const orientation: Orientation = randomInt(2) === 0 ? 'horizontal' : 'vertical'
        const maxRow = orientation === 'vertical' ? BOARD_SIZE - def.length : BOARD_SIZE - 1
        const maxCol = orientation === 'horizontal' ? BOARD_SIZE - def.length : BOARD_SIZE - 1
        const start: Coordinate = { row: randomInt(maxRow + 1), col: randomInt(maxCol + 1) }
        const cells = shipCells(start, def.length, orientation)
        if (!isValidShipPlacement(cells, occupied)) continue

        for (const cell of cells) occupied.add(coordinateKey(cell))
        ships.push({
          id: `${def.type}`,
          type: def.type,
          length: def.length,
          positions: cells,
          hits: cells.map(() => false),
          sunk: false
        })
        placed = true
        break
      }
      if (!placed) {
        ok = false
        break
      }
    }

    if (ok && ships.length === SHIP_DEFINITIONS.length) {
      // Return in the canonical definition order for stable UI rendering.
      return SHIP_DEFINITIONS.map(
        (def) => ships.find((s) => s.type === def.type) as Ship
      )
    }
  }

  // Should be unreachable for a 10x10 board and this fleet.
  throw new Error('Failed to generate a valid Battleships fleet')
}

/** True once every cell of a ship has been hit. */
export function isShipSunk(ship: Ship): boolean {
  return ship.hits.every((h) => h)
}

/** True once every ship in a fleet is sunk. */
export function isFleetSunk(ships: Ship[]): boolean {
  return ships.length > 0 && ships.every((s) => s.sunk)
}

/** Create a new game: both players get independently randomized fleets. */
export function createGame(playerOrder: string[]): BattleshipsGameState {
  const boards: Record<string, BattleshipsBoard> = {}
  for (const id of playerOrder) {
    boards[id] = { ships: generateRandomFleet(), shots: [] }
  }
  return {
    status: 'playing',
    playerOrder: [...playerOrder],
    // Randomly decide who fires first.
    currentPlayerIndex: randomInt(playerOrder.length),
    boards
  }
}

export function currentPlayerId(state: BattleshipsGameState): string {
  return state.playerOrder[state.currentPlayerIndex]
}

function opponentId(state: BattleshipsGameState, playerId: string): string | undefined {
  return state.playerOrder.find((id) => id !== playerId)
}

/**
 * Fire a shot for `playerId` at `coordinate` on the opponent's board.
 * The server is authoritative: it decides hit/miss, updates ship damage,
 * detects sinks and game-over, and advances the turn. A hit lets the player
 * keep firing; only a miss ends the turn.
 */
export function fireShot(
  state: BattleshipsGameState,
  playerId: string,
  coordinate: Coordinate
): ActionResult {
  if (state.status !== 'playing') return fail('GAME_OVER', 'The game has already finished.')
  if (currentPlayerId(state) !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  if (!isInsideBoard(coordinate)) return fail('INVALID_ACTION', 'That coordinate is off the board.')

  const targetId = opponentId(state, playerId)
  if (!targetId) return fail('INVALID_ACTION', 'No opponent to fire at.')

  const targetBoard = state.boards[targetId]
  if (targetBoard.shots.some((s) => coordinatesEqual(s.coordinate, coordinate))) {
    return fail('INVALID_ACTION', 'You have already fired at that coordinate.')
  }

  // Determine hit/miss and update the struck ship (immutably).
  const result: ShotResult = targetBoard.ships.some((ship) =>
    ship.positions.some((p) => coordinatesEqual(p, coordinate))
  )
    ? 'hit'
    : 'miss'
  let sunkShipType: ShipType | undefined
  const ships = targetBoard.ships.map((ship) => {
    const cellIndex = ship.positions.findIndex((p) => coordinatesEqual(p, coordinate))
    if (cellIndex === -1) return ship
    const hits = ship.hits.slice()
    hits[cellIndex] = true
    const sunk = hits.every((h) => h)
    if (sunk && !ship.sunk) sunkShipType = ship.type
    return { ...ship, hits, sunk }
  })

  const shots: Shot[] = [...targetBoard.shots, { coordinate, result }]
  const boards: Record<string, BattleshipsBoard> = {
    ...state.boards,
    [targetId]: { ships, shots }
  }

  const lastShot: LastShotEvent = { by: playerId, coordinate, result, sunkShipType }

  if (isFleetSunk(ships)) {
    return {
      ok: true,
      state: { ...state, boards, status: 'finished', winnerId: playerId, lastShot }
    }
  }

  // A hit keeps the turn with the same player; a miss passes it on.
  const nextIndex =
    result === 'hit'
      ? state.currentPlayerIndex
      : (state.currentPlayerIndex + 1) % state.playerOrder.length
  return {
    ok: true,
    state: { ...state, boards, currentPlayerIndex: nextIndex, lastShot }
  }
}

/**
 * Remove a player from an in-progress game (disconnect/leave). In a 1v1 match
 * this awards the remaining player the win. Returns null if nobody remains.
 */
export function removePlayerFromGame(
  state: BattleshipsGameState,
  playerId: string
): BattleshipsGameState | null {
  if (!state.playerOrder.includes(playerId)) return state
  const playerOrder = state.playerOrder.filter((id) => id !== playerId)
  if (playerOrder.length === 0) return null

  const boards = { ...state.boards }
  delete boards[playerId]

  if (state.status === 'finished') {
    return { ...state, playerOrder, boards, currentPlayerIndex: 0 }
  }
  // Award the win to whoever is left (server-authoritative).
  return {
    ...state,
    playerOrder,
    boards,
    currentPlayerIndex: 0,
    status: 'finished',
    winnerId: playerOrder[0]
  }
}
