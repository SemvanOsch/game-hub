/**
 * Presentation helpers that turn a sanitized {@link BattleshipsView} into
 * per-cell render descriptors for the two boards. Pure/derivation only — no game
 * rules live here (those are server-authoritative in shared/battleships).
 */
import { BOARD_SIZE, coordinateKey, type Ship, type ShipType } from '@shared/battleships/types'
import type { BattleshipsView } from '@shared/battleships/view'

export type CellState = 'water' | 'ship' | 'miss' | 'hit' | 'sunk' | 'unknown'

/** Which sides of a cell sit on the outer edge of the ship it belongs to. */
export interface ShipOutline {
  /** 0..4, stable per ship type — drives the outline color. */
  colorIndex: number
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

export interface CellView {
  state: CellState
  /** Present when this cell is part of a (revealed) ship. */
  ship: ShipOutline | null
}

/** Distinct outline color per ship type, so adjacent ships are easy to tell apart. */
export const SHIP_COLORS = ['#f4c063', '#38bdf8', '#43c59e', '#c77dff', '#ff8f5e']

const SHIP_COLOR_INDEX: Record<ShipType, number> = {
  carrier: 0,
  battleship: 1,
  cruiser: 2,
  submarine: 3,
  destroyer: 4
}

function emptyGrid(fill: CellState): CellView[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ state: fill, ship: null }) as CellView)
  )
}

/**
 * Trace a colored outline around each ship: a side is an outer edge whenever the
 * neighboring cell in that direction is not part of the same ship.
 */
function applyShipOutlines(ships: Ship[], grid: CellView[][]): void {
  for (const ship of ships) {
    const colorIndex = SHIP_COLOR_INDEX[ship.type]
    const cells = new Set(ship.positions.map((p) => coordinateKey(p)))
    for (const p of ship.positions) {
      grid[p.row][p.col].ship = {
        colorIndex,
        top: !cells.has(coordinateKey({ row: p.row - 1, col: p.col })),
        bottom: !cells.has(coordinateKey({ row: p.row + 1, col: p.col })),
        left: !cells.has(coordinateKey({ row: p.row, col: p.col - 1 })),
        right: !cells.has(coordinateKey({ row: p.row, col: p.col + 1 }))
      }
    }
  }
}

/** The local player's own board: their ships plus the opponent's shots. */
export function buildOwnCells(view: BattleshipsView): CellView[][] {
  const grid = emptyGrid('water')
  for (const ship of view.own.ships) {
    ship.positions.forEach((pos, i) => {
      grid[pos.row][pos.col].state = ship.sunk ? 'sunk' : ship.hits[i] ? 'hit' : 'ship'
    })
  }
  for (const shot of view.own.shots) {
    if (shot.result === 'miss') grid[shot.coordinate.row][shot.coordinate.col].state = 'miss'
  }
  applyShipOutlines(view.own.ships, grid)
  return grid
}

/**
 * The opponent's board, from the local player's perspective. Only revealed
 * (sunk, or all-when-finished) enemy ships and the player's own shots are shown;
 * unfired cells stay 'unknown'.
 */
export function buildEnemyCells(view: BattleshipsView): CellView[][] {
  const grid = emptyGrid('unknown')
  for (const ship of view.enemy.revealedShips) {
    for (const pos of ship.positions) {
      grid[pos.row][pos.col].state = ship.sunk ? 'sunk' : 'ship'
    }
  }
  for (const shot of view.enemy.shots) {
    const { row, col } = shot.coordinate
    if (shot.result === 'miss') grid[row][col].state = 'miss'
    else if (grid[row][col].state !== 'sunk') grid[row][col].state = 'hit'
  }
  applyShipOutlines(view.enemy.revealedShips, grid)
  return grid
}
