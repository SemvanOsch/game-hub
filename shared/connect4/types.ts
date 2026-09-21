/**
 * Connect 4 domain types, shared by server and renderer.
 *
 * The board is a `ROWS`×`COLUMNS` grid of cells. Row 0 is the TOP of the board
 * and row `ROWS - 1` is the bottom; a dropped disc falls to the largest (lowest)
 * empty row index in its column. Cells hold a player's colour or `null` when
 * empty. Keep this file free of Node/browser-specific imports.
 */

export const COLUMNS = 7
export const ROWS = 6
/** Discs in a row needed to win. */
export const CONNECT = 4

/** A player's disc colour. Player 1 is always red, player 2 always yellow. */
export type Connect4PlayerColor = 'red' | 'yellow'

/** A single board cell: empty (`null`) or occupied by a coloured disc. */
export type Connect4Cell = Connect4PlayerColor | null

/** The board grid, indexed `[row][column]`. */
export type Connect4Board = Connect4Cell[][]

/** A board coordinate, both 0-based. */
export interface Connect4Coord {
  row: number
  column: number
}

/** Colours assigned by seat order: first player red, second yellow. */
export const SEAT_COLORS: readonly Connect4PlayerColor[] = ['red', 'yellow'] as const

export function isColumnInRange(column: number): boolean {
  return Number.isInteger(column) && column >= 0 && column < COLUMNS
}
