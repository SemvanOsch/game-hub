/**
 * Battleships domain types, shared by server and renderer.
 *
 * Coordinates are represented numerically (row/col, both 0-based) throughout the
 * game logic; {@link coordinateToLabel} converts to the familiar "A1"–"J10"
 * grid labels only for display.
 */

export const BOARD_SIZE = 10

export type ShipType = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer'

export interface ShipDefinition {
  type: ShipType
  name: string
  length: number
}

/**
 * The canonical fleet. Both players always receive exactly these ships.
 * Centralized here so lengths/names are never hardcoded elsewhere.
 */
export const SHIP_DEFINITIONS: readonly ShipDefinition[] = [
  { type: 'carrier', name: 'Carrier', length: 5 },
  { type: 'battleship', name: 'Battleship', length: 4 },
  { type: 'cruiser', name: 'Cruiser', length: 3 },
  { type: 'submarine', name: 'Submarine', length: 3 },
  { type: 'destroyer', name: 'Destroyer', length: 2 }
] as const

export const SHIP_NAMES: Record<ShipType, string> = {
  carrier: 'Carrier',
  battleship: 'Battleship',
  cruiser: 'Cruiser',
  submarine: 'Submarine',
  destroyer: 'Destroyer'
}

export type Coordinate = {
  row: number
  col: number
}

export type Orientation = 'horizontal' | 'vertical'

export type ShotResult = 'hit' | 'miss'

export interface Shot {
  coordinate: Coordinate
  result: ShotResult
}

/** A placed ship with its occupied cells and per-cell hit tracking. */
export interface Ship {
  id: string
  type: ShipType
  length: number
  positions: Coordinate[]
  /** Parallel to {@link positions}: whether each cell has been hit. */
  hits: boolean[]
  sunk: boolean
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

const COLUMN_LETTERS = 'ABCDEFGHIJ'

/** Convert a 0-based coordinate to a display label, e.g. {row:0,col:0} -> "A1". */
export function coordinateToLabel(c: Coordinate): string {
  return `${COLUMN_LETTERS[c.col] ?? '?'}${c.row + 1}`
}

export function isInsideBoard(c: Coordinate): boolean {
  return c.row >= 0 && c.row < BOARD_SIZE && c.col >= 0 && c.col < BOARD_SIZE
}

export function coordinatesEqual(a: Coordinate, b: Coordinate): boolean {
  return a.row === b.row && a.col === b.col
}

/** Stable key for a coordinate, handy for Set/Map lookups. */
export function coordinateKey(c: Coordinate): string {
  return `${c.row},${c.col}`
}
