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
import {
  ABILITY_INVENTORY_KEY,
  getAbilityTargets,
  initialAbilities,
  rewardForShipLost,
  type AbilityInventory,
  type AbilityType
} from './abilities'

/** A single player's fleet plus the shots the opponent has fired at it. */
export interface BattleshipsBoard {
  ships: Ship[]
  /** Shots fired AT this board (i.e. by the opponent). */
  shots: Shot[]
  /** This player's own ability charges (grows as their ships are sunk). */
  abilities: AbilityInventory
  /** How many of THIS player's own ships have been completely sunk. */
  shipsDestroyedCount: number
}

export interface LastShotEvent {
  /** Player id who fired the shot. */
  by: string
  coordinate: Coordinate
  result: ShotResult
  /** Set only when this shot sank a ship. */
  sunkShipType?: ShipType
}

/** A single cell struck by an ability, with its outcome. */
export interface AbilityCellOutcome {
  coordinate: Coordinate
  result: ShotResult
}

/** The most recent ability resolution, surfaced to clients for feedback/animation. */
export interface LastAbilityEvent {
  /** Player id who used the ability. */
  by: string
  ability: AbilityType
  /** The cell the player selected (centre of the pattern). */
  target: Coordinate
  /** Every cell actually fired at (already-shot cells are excluded). */
  cells: AbilityCellOutcome[]
  hits: number
  misses: number
  /** Ship types newly sunk by this ability, in the order they were sunk. */
  sunkShipTypes: ShipType[]
}

/** Authoritative server state. Contains hidden information for both players. */
export interface BattleshipsGameState {
  status: 'playing' | 'finished'
  playerOrder: string[]
  currentPlayerIndex: number
  boards: Record<string, BattleshipsBoard>
  winnerId?: string
  /** The most recent normal shot, surfaced to clients for shot feedback. */
  lastShot?: LastShotEvent
  /** The most recent ability resolution, surfaced to clients for feedback. */
  lastAbility?: LastAbilityEvent
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

/** An empty board with no ships, no shots taken, and a starting ability inventory. */
export function createBoard(): BattleshipsBoard {
  return { ships: [], shots: [], abilities: initialAbilities(), shipsDestroyedCount: 0 }
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
    boards[id] = {
      ships: generateRandomFleet(),
      shots: [],
      abilities: initialAbilities(),
      shipsDestroyedCount: 0
    }
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
 * Result of resolving one or more strikes against a single board: the updated
 * fleet + inventory, the per-cell outcomes, and the ships newly sunk (which have
 * already been rewarded to the board owner).
 */
interface StrikeResolution {
  board: BattleshipsBoard
  outcomes: AbilityCellOutcome[]
  sunkShipTypes: ShipType[]
}

/**
 * Apply a set of strikes to `board` immutably. Coordinates must already be
 * de-duplicated and unshot. Multiple cells on the same ship accumulate, so one
 * ability can sink a ship in a single resolution. Each ship that transitions
 * from afloat to sunk awards the BOARD OWNER (the defender) an ability, per
 * {@link rewardForShipLost} — rewards are for losing your own ships, never for
 * destroying the enemy's.
 */
function resolveStrikes(board: BattleshipsBoard, coordinates: Coordinate[]): StrikeResolution {
  const ships = board.ships.map((s) => ({ ...s, hits: s.hits.slice() }))
  const outcomes: AbilityCellOutcome[] = []
  const sunkShipTypes: ShipType[] = []
  const abilities: AbilityInventory = { ...board.abilities }
  let shipsDestroyedCount = board.shipsDestroyedCount

  for (const coordinate of coordinates) {
    let result: ShotResult = 'miss'
    for (const ship of ships) {
      const cellIndex = ship.positions.findIndex((p) => coordinatesEqual(p, coordinate))
      if (cellIndex === -1) continue
      result = 'hit'
      ship.hits[cellIndex] = true
      if (!ship.sunk && ship.hits.every((h) => h)) {
        ship.sunk = true
        sunkShipTypes.push(ship.type)
        shipsDestroyedCount += 1
        const reward = rewardForShipLost(shipsDestroyedCount)
        if (reward) abilities[reward] += 1
      }
      break
    }
    outcomes.push({ coordinate, result })
  }

  const shots: Shot[] = [...board.shots, ...outcomes]
  return {
    board: { ships, shots, abilities, shipsDestroyedCount },
    outcomes,
    sunkShipTypes
  }
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

  const { board, outcomes, sunkShipTypes } = resolveStrikes(targetBoard, [coordinate])
  const result = outcomes[0].result
  const boards: Record<string, BattleshipsBoard> = { ...state.boards, [targetId]: board }
  const lastShot: LastShotEvent = {
    by: playerId,
    coordinate,
    result,
    sunkShipType: sunkShipTypes[0]
  }

  if (isFleetSunk(board.ships)) {
    return {
      ok: true,
      state: {
        ...state,
        boards,
        status: 'finished',
        winnerId: playerId,
        lastShot,
        lastAbility: undefined
      }
    }
  }

  // A hit keeps the turn with the same player; a miss passes it on.
  const nextIndex =
    result === 'hit'
      ? state.currentPlayerIndex
      : (state.currentPlayerIndex + 1) % state.playerOrder.length
  return {
    ok: true,
    state: { ...state, boards, currentPlayerIndex: nextIndex, lastShot, lastAbility: undefined }
  }
}

/**
 * Use a special ability for `playerId`, striking the opponent's board from the
 * selected `target`. Unlike a normal shot, an ability ALWAYS consumes one turn
 * regardless of how many cells it hits.
 *
 * Fully server-authoritative: verifies turn, ownership of a charge, and a valid
 * unshot target; computes the affected cells (including the Scatter Missile's
 * random ones); applies hits, sinks, and rewards; consumes one charge; and
 * detects game-over. `rng` is injectable for deterministic tests.
 */
export function useAbility(
  state: BattleshipsGameState,
  playerId: string,
  ability: AbilityType,
  target: Coordinate,
  rng: () => number = Math.random
): ActionResult {
  if (state.status !== 'playing') return fail('GAME_OVER', 'The game has already finished.')
  if (currentPlayerId(state) !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  if (!isInsideBoard(target)) return fail('INVALID_ACTION', 'That coordinate is off the board.')

  const attackerBoard = state.boards[playerId]
  const inventoryKey = ABILITY_INVENTORY_KEY[ability]
  if (!attackerBoard || attackerBoard.abilities[inventoryKey] <= 0) {
    return fail('INVALID_ACTION', 'You have no charges of that ability.')
  }

  const targetId = opponentId(state, playerId)
  if (!targetId) return fail('INVALID_ACTION', 'No opponent to fire at.')

  const targetBoard = state.boards[targetId]
  const alreadyShot = new Set(targetBoard.shots.map((s) => coordinateKey(s.coordinate)))
  if (alreadyShot.has(coordinateKey(target))) {
    return fail('INVALID_ACTION', 'You have already fired at that coordinate.')
  }

  // The server computes the affected cells (Scatter Missile's are random here).
  const shotCoords = targetBoard.shots.map((s) => s.coordinate)
  const affected = getAbilityTargets(ability, target, shotCoords, rng)
  // Ignore already-shot cells; the validated centre is guaranteed unshot.
  const fresh = affected.filter((c) => !alreadyShot.has(coordinateKey(c)))

  const { board, outcomes, sunkShipTypes } = resolveStrikes(targetBoard, fresh)

  // Consume exactly one charge from the attacker's own inventory.
  const attacker: BattleshipsBoard = {
    ...attackerBoard,
    abilities: { ...attackerBoard.abilities, [inventoryKey]: attackerBoard.abilities[inventoryKey] - 1 }
  }

  const boards: Record<string, BattleshipsBoard> = {
    ...state.boards,
    [targetId]: board,
    [playerId]: attacker
  }

  const hits = outcomes.filter((o) => o.result === 'hit').length
  const lastAbility: LastAbilityEvent = {
    by: playerId,
    ability,
    target,
    cells: outcomes,
    hits,
    misses: outcomes.length - hits,
    sunkShipTypes
  }

  if (isFleetSunk(board.ships)) {
    return {
      ok: true,
      state: {
        ...state,
        boards,
        status: 'finished',
        winnerId: playerId,
        lastAbility,
        lastShot: undefined
      }
    }
  }

  // An ability always ends the turn.
  const nextIndex = (state.currentPlayerIndex + 1) % state.playerOrder.length
  return {
    ok: true,
    state: { ...state, boards, currentPlayerIndex: nextIndex, lastAbility, lastShot: undefined }
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
