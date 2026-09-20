/**
 * Special-ability rules for Battleships — pure geometry, inventory, and reward
 * logic with no React, no networking, no I/O beyond Math.random (for the
 * server-side Scatter Missile randomness, mirroring `generateRandomFleet`).
 *
 * An ability is an alternative to a normal single-cell shot: the player spends
 * one charge and one turn to strike a whole pattern of cells at once. All of the
 * geometry here returns UNIQUE, IN-BOUNDS coordinates, clipped at board edges.
 *
 * SECURITY: the client only ever names the ability and a single target cell.
 * The affected cells — and, crucially, the Scatter Missile's random cells — are
 * computed here on the server. A client can never dictate them.
 */
import {
  BOARD_SIZE,
  coordinateKey,
  coordinatesEqual,
  isInsideBoard,
  type Coordinate
} from './types'

/** Wire-level ability identifiers (what the client sends). */
export type AbilityType = 'bombs' | 'scatter_missile' | 'nuke'

export const ABILITY_TYPES: readonly AbilityType[] = ['bombs', 'scatter_missile', 'nuke'] as const

/** Per-player ability charges. Keys are camelCase; wire ids map via {@link ABILITY_INVENTORY_KEY}. */
export interface AbilityInventory {
  bombs: number
  scatterMissile: number
  nuke: number
}

/** Starting inventory every player begins the game with. */
export function initialAbilities(): AbilityInventory {
  return { bombs: 2, scatterMissile: 0, nuke: 0 }
}

/** Maps a wire ability id to its {@link AbilityInventory} key. */
export const ABILITY_INVENTORY_KEY: Record<AbilityType, keyof AbilityInventory> = {
  bombs: 'bombs',
  scatter_missile: 'scatterMissile',
  nuke: 'nuke'
}

export function isAbilityType(value: unknown): value is AbilityType {
  return value === 'bombs' || value === 'scatter_missile' || value === 'nuke'
}

/** How many additional random cells a Scatter Missile strikes beyond the target. */
export const SCATTER_EXTRA_CELLS = 5

/** Display metadata for an ability (name + short description shown in the UI). */
export interface AbilityMeta {
  id: AbilityType
  name: string
  description: string
  inventoryKey: keyof AbilityInventory
}

export const ABILITY_META: Record<AbilityType, AbilityMeta> = {
  bombs: {
    id: 'bombs',
    name: 'Bombs',
    description: 'Hits a + shaped area.',
    inventoryKey: 'bombs'
  },
  scatter_missile: {
    id: 'scatter_missile',
    name: 'Scatter Missile',
    description: 'Hits the target and 5 random unshot cells.',
    inventoryKey: 'scatterMissile'
  },
  nuke: {
    id: 'nuke',
    name: 'Nuke',
    description: 'Hits a large diamond-shaped area.',
    inventoryKey: 'nuke'
  }
}

// ---------------------------------------------------------------------------
// Reward logic
// ---------------------------------------------------------------------------

/**
 * The ability a player is awarded when one of their OWN ships is completely
 * sunk. `shipsDestroyed` is the running count AFTER the ship transitions to
 * sunk (1 for the first ship lost, 2 for the second, …). Returns the inventory
 * key to increment, or null when no reward applies (5th ship onward).
 *
 *   1st own ship lost -> +1 Bomb
 *   2nd               -> +1 Scatter Missile
 *   3rd               -> +1 Scatter Missile
 *   4th               -> +1 Nuke
 *   5th+              -> nothing
 */
export function rewardForShipLost(shipsDestroyed: number): keyof AbilityInventory | null {
  switch (shipsDestroyed) {
    case 1:
      return 'bombs'
    case 2:
    case 3:
      return 'scatterMissile'
    case 4:
      return 'nuke'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Ability geometry
// ---------------------------------------------------------------------------

/** Deduplicate + drop off-board coordinates, preserving first-seen order. */
function cleanTargets(cells: Coordinate[]): Coordinate[] {
  const seen = new Set<string>()
  const out: Coordinate[] = []
  for (const cell of cells) {
    if (!isInsideBoard(cell)) continue
    const key = coordinateKey(cell)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cell)
  }
  return out
}

/**
 * Bombs — a `+` shape: the centre plus its four orthogonally-adjacent cells.
 * Clipped at board edges, so a corner target yields fewer than 5 cells.
 */
export function getBombTargets(center: Coordinate): Coordinate[] {
  return cleanTargets([
    center,
    { row: center.row - 1, col: center.col },
    { row: center.row + 1, col: center.col },
    { row: center.row, col: center.col - 1 },
    { row: center.row, col: center.col + 1 }
  ])
}

/**
 * Nuke — a diamond of Manhattan radius 2 around the centre (up to 13 cells).
 * Clipped at board edges.
 */
export function getNukeTargets(center: Coordinate): Coordinate[] {
  const cells: Coordinate[] = []
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (Math.abs(dr) + Math.abs(dc) <= 2) {
        cells.push({ row: center.row + dr, col: center.col + dc })
      }
    }
  }
  return cleanTargets(cells)
}

/**
 * Scatter Missile — the chosen `center` plus up to {@link SCATTER_EXTRA_CELLS}
 * additional random cells that are inside the board, not the centre, and not
 * previously fired upon. Uniqueness is guaranteed. If fewer than 5 eligible
 * cells remain, every remaining unshot cell is struck.
 *
 * The randomness lives on the server; a client cannot influence which cells are
 * chosen (it only sends `center`). `rng` is injectable for deterministic tests.
 */
export function getScatterTargets(
  center: Coordinate,
  previouslyShot: Coordinate[],
  rng: () => number = Math.random
): Coordinate[] {
  const shot = new Set(previouslyShot.map((c) => coordinateKey(c)))
  const centerKey = coordinateKey(center)

  // Every board cell that is eligible to be a random extra target.
  const pool: Coordinate[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const key = `${row},${col}`
      if (key === centerKey || shot.has(key)) continue
      pool.push({ row, col })
    }
  }

  // Fisher–Yates partial shuffle to pick unique random cells.
  const pickCount = Math.min(SCATTER_EXTRA_CELLS, pool.length)
  for (let i = 0; i < pickCount; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }

  return [center, ...pool.slice(0, pickCount)]
}

/**
 * Resolve the full set of cells an ability strikes from a chosen target.
 * Scatter Missile draws its random cells here (server-side); Bombs/Nuke are
 * deterministic geometry. `previouslyShot` is the opponent board's existing
 * shots — used only by Scatter Missile to avoid re-picking fired cells.
 */
export function getAbilityTargets(
  ability: AbilityType,
  center: Coordinate,
  previouslyShot: Coordinate[],
  rng: () => number = Math.random
): Coordinate[] {
  switch (ability) {
    case 'bombs':
      return getBombTargets(center)
    case 'nuke':
      return getNukeTargets(center)
    case 'scatter_missile':
      return getScatterTargets(center, previouslyShot, rng)
  }
}

/** Client-side preview geometry for the hovered cell (never used to fire). */
export function getAbilityPreview(ability: AbilityType, center: Coordinate): Coordinate[] {
  switch (ability) {
    case 'bombs':
      return getBombTargets(center)
    case 'nuke':
      return getNukeTargets(center)
    // Scatter Missile's random cells do not exist until the server resolves it.
    case 'scatter_missile':
      return isInsideBoard(center) ? [center] : []
  }
}

export { coordinatesEqual }
