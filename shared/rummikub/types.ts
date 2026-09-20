/**
 * Core Rummikub tile/group types, shared by the pure rules, the authoritative
 * engine, the sanitized client view and the renderer.
 *
 * Keep this file isomorphic: no Node- or browser-specific imports.
 */

export type RummikubColor = 'red' | 'blue' | 'black' | 'orange'

export const RUMMIKUB_COLORS: readonly RummikubColor[] = ['red', 'blue', 'black', 'orange']

/** Lowest and highest number printed on a numbered tile. */
export const MIN_TILE_VALUE = 1
export const MAX_TILE_VALUE = 13

/** Number of copies of every colour/number combination in the bag. */
export const TILE_COPIES = 2

/** Jokers in the bag. */
export const JOKER_COUNT = 2

/** Tiles dealt to each player at the start of a game. */
export const STARTING_RACK_SIZE = 14

/** Minimum total value a player's first-ever meld must reach to "open". */
export const INITIAL_MELD_MINIMUM = 30

/** Penalty value of a joker left on a rack when the game ends. */
export const JOKER_PENALTY = 30

/** Smallest legal group (run or set) size. */
export const MIN_GROUP_SIZE = 3

/**
 * A single physical tile. Every tile carries a unique {@link id} so the server
 * can distinguish the two copies of, say, "red 7" and track exactly which tile
 * moved where. Jokers have `isJoker: true` and no colour/value.
 */
export interface RummikubTile {
  id: string
  color?: RummikubColor
  value?: number
  isJoker: boolean
}

/**
 * A group laid on the table: an ordered list of tile ids. Order matters for
 * runs (the tiles read left-to-right as consecutive numbers); for sets the
 * order is cosmetic. The engine resolves ids back to tiles when validating.
 */
export interface RummikubGroup {
  id: string
  tileIds: string[]
}
