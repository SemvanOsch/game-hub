/**
 * Pure, authoritative Rummikub group/table validation. No React, no networking,
 * no I/O. These functions decide whether an arrangement of tiles is legal, and
 * are the single source of truth the server trusts when committing a turn.
 *
 * Two group shapes are legal:
 *   - RUN: 3+ tiles, one colour, consecutive ascending numbers (1 is low only).
 *   - SET: 3–4 tiles, one number, all different colours.
 * Jokers substitute for any tile the group needs.
 */
import {
  MAX_TILE_VALUE,
  MIN_GROUP_SIZE,
  MIN_TILE_VALUE,
  type RummikubGroup,
  type RummikubTile
} from './types'

export type GroupKind = 'run' | 'set'

/** A validated group: whether it is a run or a set, and its total point value
 *  (with each joker counted as the tile it stands in for). */
export interface ResolvedGroup {
  kind: GroupKind
  /** Sum of the group's tile values, jokers resolved to what they represent. */
  value: number
}

function isJoker(t: RummikubTile): boolean {
  return t.isJoker
}

/**
 * Resolve a SET: 3–4 tiles sharing one number across distinct colours, jokers
 * filling missing colours. Order does not matter. Returns null if not a set.
 */
export function resolveSet(tiles: readonly RummikubTile[]): ResolvedGroup | null {
  if (tiles.length < MIN_GROUP_SIZE || tiles.length > 4) return null
  const numbered = tiles.filter((t) => !isJoker(t))
  // A group of only jokers has no number to anchor on — not a valid set.
  if (numbered.length === 0) return null

  const value = numbered[0].value
  if (value === undefined) return null
  const colors = new Set<string>()
  for (const t of numbered) {
    if (t.value !== value) return null // every non-joker must share the number
    if (t.color === undefined || colors.has(t.color)) return null // distinct colours only
    colors.add(t.color)
  }
  // With ≤4 tiles and distinct non-joker colours, the jokers can always take the
  // remaining colours, so the set is valid. Each tile is worth the number.
  return { kind: 'set', value: value * tiles.length }
}

/**
 * Analyse whether a multiset of tiles can form a run, and if so, the run's
 * numeric span [start, end] once jokers are placed. Order-independent.
 *
 * Joker values are assigned deterministically: internal gaps are filled first,
 * then any spare jokers extend the run upward toward 13 (and downward if that
 * would overshoot). This keeps both the point value and the display order
 * single-valued. Returns null if the tiles cannot form a run.
 */
function analyzeRun(tiles: readonly RummikubTile[]): { start: number; end: number } | null {
  if (tiles.length < MIN_GROUP_SIZE) return null

  const numbered = tiles.filter((t) => !isJoker(t))
  if (numbered.length === 0) return null // all-joker "run" is not resolvable

  // One colour across all non-jokers.
  const color = numbered[0].color
  if (color === undefined) return null
  if (numbered.some((t) => t.color !== color || t.value === undefined)) return null

  const values = numbered.map((t) => t.value as number).sort((a, b) => a - b)
  // No repeated values allowed within a run.
  for (let i = 1; i < values.length; i++) {
    if (values[i] === values[i - 1]) return null
  }

  const min = values[0]
  const max = values[values.length - 1]
  const span = max - min + 1
  const jokers = tiles.length - numbered.length
  const internalGaps = span - numbered.length
  if (internalGaps < 0 || jokers < internalGaps) return null // can't fill the gaps

  const extra = jokers - internalGaps // spare jokers extend the run's ends
  const total = tiles.length
  if (total > MAX_TILE_VALUE) return null

  // Place the run: cover [min, max], then extend upward, then downward.
  let start = min
  let end = max + extra
  if (end > MAX_TILE_VALUE) {
    const overflow = end - MAX_TILE_VALUE
    end = MAX_TILE_VALUE
    start = min - overflow
  }
  if (start < MIN_TILE_VALUE) return null

  return { start, end }
}

/** Resolve a RUN (see {@link analyzeRun}) into its kind and total point value. */
export function resolveRun(tiles: readonly RummikubTile[]): ResolvedGroup | null {
  const run = analyzeRun(tiles)
  if (!run) return null
  const total = tiles.length
  const value = ((run.start + run.end) * total) / 2
  return { kind: 'run', value }
}

/**
 * Return the tiles of a valid run arranged in ascending display order (jokers
 * dropped into the gaps they fill). Returns null if the tiles are not a run, so
 * callers can fall back to the original order (e.g. for sets). This is what lets
 * a run entered as "8 6 7" render and commit as "6 7 8".
 */
export function orderRunTiles(tiles: readonly RummikubTile[]): RummikubTile[] | null {
  const run = analyzeRun(tiles)
  if (!run) return null
  const slots: (RummikubTile | null)[] = new Array(run.end - run.start + 1).fill(null)
  const jokers: RummikubTile[] = []
  for (const tile of tiles) {
    if (isJoker(tile) || tile.value === undefined) {
      jokers.push(tile)
    } else {
      slots[tile.value - run.start] = tile
    }
  }
  const ordered: RummikubTile[] = []
  for (const slot of slots) ordered.push(slot ?? (jokers.pop() as RummikubTile))
  return ordered
}

/** Resolve a group as a set or a run, whichever fits. Null if neither. */
export function resolveGroup(tiles: readonly RummikubTile[]): ResolvedGroup | null {
  return resolveSet(tiles) ?? resolveRun(tiles)
}

/** Whether the tiles form a legal run. */
export function isValidRun(tiles: readonly RummikubTile[]): boolean {
  return resolveRun(tiles) !== null
}

/** Whether the tiles form a legal set. */
export function isValidSet(tiles: readonly RummikubTile[]): boolean {
  return resolveSet(tiles) !== null
}

/** Whether the tiles form a legal group (run or set). */
export function isValidGroup(tiles: readonly RummikubTile[]): boolean {
  return resolveGroup(tiles) !== null
}

/** Point value of a group (jokers resolved), or 0 if the group is invalid. */
export function groupValue(tiles: readonly RummikubTile[]): number {
  return resolveGroup(tiles)?.value ?? 0
}

/**
 * Resolve a group's tile ids to tiles via a lookup, preserving order. Returns
 * null if any id is unknown.
 */
export function tilesOf(
  group: RummikubGroup,
  byId: ReadonlyMap<string, RummikubTile>
): RummikubTile[] | null {
  const tiles: RummikubTile[] = []
  for (const id of group.tileIds) {
    const tile = byId.get(id)
    if (!tile) return null
    tiles.push(tile)
  }
  return tiles
}

/**
 * Validate an entire table: every group must resolve to a legal run or set.
 * Returns the id of the first invalid group, or null when the whole table is
 * legal (including an empty table).
 */
export function firstInvalidGroup(
  table: readonly RummikubGroup[],
  byId: ReadonlyMap<string, RummikubTile>
): string | null {
  for (const group of table) {
    const tiles = tilesOf(group, byId)
    if (!tiles || resolveGroup(tiles) === null) return group.id
  }
  return null
}

/** Whether every group on the table is a legal run or set. */
export function isValidTable(
  table: readonly RummikubGroup[],
  byId: ReadonlyMap<string, RummikubTile>
): boolean {
  return firstInvalidGroup(table, byId) === null
}

/**
 * Total value of a collection of brand-new groups — used to check the 30-point
 * initial meld. Assumes each group is already known to be valid.
 */
export function totalGroupValue(
  groups: readonly RummikubGroup[],
  byId: ReadonlyMap<string, RummikubTile>
): number {
  let total = 0
  for (const group of groups) {
    const tiles = tilesOf(group, byId)
    if (tiles) total += groupValue(tiles)
  }
  return total
}
