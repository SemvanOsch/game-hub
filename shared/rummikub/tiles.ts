/**
 * Tile-set generation, shuffling and dealing for Rummikub. Pure functions — the
 * only source of nondeterminism is Math.random (shuffling), which the server
 * calls authoritatively. Clients never generate or order tiles.
 */
import {
  JOKER_COUNT,
  JOKER_PENALTY,
  MAX_TILE_VALUE,
  MIN_TILE_VALUE,
  RUMMIKUB_COLORS,
  STARTING_RACK_SIZE,
  TILE_COPIES,
  type RummikubTile
} from './types'

/**
 * Build the complete, ordered 106-tile bag: two copies of every colour/number
 * (4 × 13 × 2 = 104) plus two jokers. Every tile gets a unique, stable id so
 * the two copies of the same face are individually addressable.
 */
export function createTileSet(): RummikubTile[] {
  const tiles: RummikubTile[] = []
  for (const color of RUMMIKUB_COLORS) {
    for (let value = MIN_TILE_VALUE; value <= MAX_TILE_VALUE; value++) {
      for (let copy = 0; copy < TILE_COPIES; copy++) {
        tiles.push({ id: `t-${color}-${value}-${copy}`, color, value, isJoker: false })
      }
    }
  }
  for (let j = 0; j < JOKER_COUNT; j++) {
    tiles.push({ id: `t-joker-${j}`, isJoker: true })
  }
  return tiles
}

/**
 * Return a new array shuffled with an unbiased Fisher-Yates shuffle. The input
 * is not mutated.
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const out = input.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Deal `count` tiles per player from the top of a bag. Returns each player's
 * rack (in deal order) and the remaining draw pool. Does not mutate the bag.
 */
export function deal(
  bag: readonly RummikubTile[],
  playerCount: number,
  count: number = STARTING_RACK_SIZE
): { racks: RummikubTile[][]; pool: RummikubTile[] } {
  const racks: RummikubTile[][] = Array.from({ length: playerCount }, () => [])
  let cursor = 0
  for (let n = 0; n < count; n++) {
    for (let p = 0; p < playerCount; p++) {
      racks[p].push(bag[cursor++])
    }
  }
  return { racks, pool: bag.slice(cursor) }
}

/** The penalty value of a single tile left on a rack when the game ends. */
export function tilePenalty(tile: RummikubTile): number {
  if (tile.isJoker) return JOKER_PENALTY
  return tile.value ?? 0
}
