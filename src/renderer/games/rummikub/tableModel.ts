/**
 * Client-side working-state model for a Rummikub turn (the "turn transaction").
 *
 * Two pieces of local state, kept separate on purpose:
 *   - `rackOrder`: the player's PERSISTENT preferred ordering of their own hand.
 *     It survives view updates and opponents' moves, so a player can tidy their
 *     rack at any time — even when it is not their turn.
 *   - the working `table`: a turn-scoped, editable copy of the table. Only
 *     meaningful (editable) during the local player's turn; otherwise it mirrors
 *     the authoritative table.
 *
 * The displayed rack is always `rackOrder` minus whatever tiles the player has
 * currently dragged onto the working table, so returning a tile to the rack puts
 * it back in its remembered slot. Nothing here is authoritative — the server
 * re-validates the whole proposal (see shared/rummikub/engine.ts).
 */
import { orderRunTiles, resolveGroup } from '@shared/rummikub/rules'
import type { RummikubGroup, RummikubTile } from '@shared/rummikub/types'
import { INITIAL_MELD_MINIMUM } from '@shared/rummikub/types'
import type { RummikubView } from '@shared/rummikub/view'

let localGroupSeq = 0
function newGroupId(): string {
  return `local-${localGroupSeq++}`
}

/** Snapshot of the table groups from a view (deep copy of tile-id lists). */
export function cloneTable(table: readonly RummikubGroup[]): RummikubGroup[] {
  return table.map((g) => ({ id: g.id, tileIds: [...g.tileIds] }))
}

/**
 * Reconcile a persistent rack order against the authoritative hand membership:
 * keep the remembered order for tiles still held, append any newly drawn tiles,
 * and drop tiles that have left the hand. Preserves the player's arrangement.
 */
export function reconcileRack(prev: readonly string[], handIds: readonly string[]): string[] {
  const hand = new Set(handIds)
  const kept = prev.filter((id) => hand.has(id))
  const known = new Set(kept)
  const added = handIds.filter((id) => !known.has(id))
  return [...kept, ...added]
}

/** All tile ids currently placed on a working table. */
export function tableIdSet(table: readonly RummikubGroup[]): Set<string> {
  return new Set(table.flatMap((g) => g.tileIds))
}

/** Remove a set of tile ids from every group (dropping any emptied group). */
export function removeFromTable(
  table: readonly RummikubGroup[],
  ids: ReadonlySet<string>
): RummikubGroup[] {
  return table
    .map((g) => ({ id: g.id, tileIds: g.tileIds.filter((id) => !ids.has(id)) }))
    .filter((g) => g.tileIds.length > 0)
}

/** Move tiles into an existing group (appended), pulling them off wherever they were. */
export function moveToGroup(
  table: readonly RummikubGroup[],
  ids: string[],
  groupId: string
): RummikubGroup[] {
  const cleared = removeFromTable(table, new Set(ids))
  if (!cleared.some((g) => g.id === groupId)) {
    // The target group was emptied by the move itself — recreate it.
    return [...cleared, { id: groupId, tileIds: [...ids] }]
  }
  return cleared.map((g) =>
    g.id === groupId ? { id: g.id, tileIds: [...g.tileIds, ...ids] } : g
  )
}

/** Move tiles into a brand-new group at the end of the table. */
export function moveToNewGroup(table: readonly RummikubGroup[], ids: string[]): RummikubGroup[] {
  const cleared = removeFromTable(table, new Set(ids))
  return [...cleared, { id: newGroupId(), tileIds: [...ids] }]
}

/** Reorder the persistent rack, placing `ids` immediately before `beforeId` (or end). */
export function reorderRack(rack: readonly string[], ids: string[], beforeId: string | null): string[] {
  const idSet = new Set(ids)
  const without = rack.filter((id) => !idSet.has(id))
  if (beforeId === null || !without.includes(beforeId)) return [...without, ...ids]
  const at = without.indexOf(beforeId)
  const out = [...without]
  out.splice(at, 0, ...ids)
  return out
}

/** Sort the persistent rack for display; does not affect authoritative state. */
export function sortRack(
  rack: readonly string[],
  tiles: Record<string, RummikubTile>,
  by: 'color' | 'number'
): string[] {
  const colorRank: Record<string, number> = { red: 0, orange: 1, blue: 2, black: 3 }
  return [...rack].sort((a, b) => {
    const ta = tiles[a]
    const tb = tiles[b]
    if (!ta || !tb) return 0
    if (ta.isJoker !== tb.isJoker) return ta.isJoker ? 1 : -1 // jokers to the end
    if (ta.isJoker && tb.isJoker) return 0
    if (by === 'color') {
      const ca = colorRank[ta.color ?? ''] ?? 9
      const cb = colorRank[tb.color ?? ''] ?? 9
      if (ca !== cb) return ca - cb
      return (ta.value ?? 0) - (tb.value ?? 0)
    }
    if ((ta.value ?? 0) !== (tb.value ?? 0)) return (ta.value ?? 0) - (tb.value ?? 0)
    return (colorRank[ta.color ?? ''] ?? 9) - (colorRank[tb.color ?? ''] ?? 9)
  })
}

/**
 * Order a group's tile ids for display/commit: a valid run is sorted ascending
 * (jokers dropped into their gaps); anything else keeps its order.
 */
export function orderGroupIds(
  tileIds: readonly string[],
  byId: Record<string, RummikubTile>
): string[] {
  const tiles = tileIds.map((id) => byId[id]).filter(Boolean)
  if (tiles.length !== tileIds.length) return [...tileIds]
  const ordered = orderRunTiles(tiles)
  return ordered ? ordered.map((t) => t.id) : [...tileIds]
}

export interface TurnEvaluation {
  canFinish: boolean
  reason: string
  invalidGroupIds: string[]
  meldValue: number
  needsMeld: boolean
  /** Rack tiles the player has moved onto the table this turn. */
  playedCount: number
}

/**
 * Evaluate the working state for UX purposes: which groups are invalid, whether
 * the turn can be finished, and (before opening) the running meld value. The
 * server performs the authoritative version of these same checks.
 */
export function evaluateTurn(
  view: RummikubView,
  table: readonly RummikubGroup[]
): TurnEvaluation {
  const byId = view.tiles
  const invalidGroupIds = table
    .filter((g) => resolveGroup(g.tileIds.map((id) => byId[id]).filter(Boolean)) === null)
    .map((g) => g.id)

  const onTable = tableIdSet(table)
  const officialTableIds = new Set(view.table.flatMap((g) => g.tileIds))
  const played = view.rack.map((t) => t.id).filter((id) => onTable.has(id))
  const needsMeld = !view.selfHasOpened

  const newGroups = table.filter(
    (g) => g.tileIds.length > 0 && g.tileIds.every((id) => !officialTableIds.has(id))
  )
  const touchedExisting = table.some(
    (g) =>
      g.tileIds.some((id) => officialTableIds.has(id)) &&
      g.tileIds.some((id) => played.includes(id))
  )
  const meldValue = newGroups.reduce((sum, g) => {
    const resolved = resolveGroup(g.tileIds.map((id) => byId[id]).filter(Boolean))
    return sum + (resolved?.value ?? 0)
  }, 0)

  const base = { invalidGroupIds, meldValue, needsMeld, playedCount: played.length }

  if (played.length === 0) {
    return { ...base, canFinish: false, reason: 'Place at least one tile from your rack, or draw.' }
  }
  if (invalidGroupIds.length > 0) {
    return { ...base, canFinish: false, reason: 'Every group must be a valid run or set of 3+ tiles.' }
  }
  if (needsMeld) {
    if (touchedExisting) {
      return {
        ...base,
        canFinish: false,
        reason: 'You cannot touch tiles already on the table until you have opened.'
      }
    }
    if (meldValue < INITIAL_MELD_MINIMUM) {
      return {
        ...base,
        canFinish: false,
        reason: `Your first play must total ${INITIAL_MELD_MINIMUM}+ points (currently ${meldValue}).`
      }
    }
  }
  return { ...base, canFinish: true, reason: 'Ready to finish your turn.' }
}

/** Build the proposed action payload, with run groups sorted into order. */
export function toFinishPayload(
  view: RummikubView,
  table: readonly RummikubGroup[],
  rackOrder: readonly string[]
): { table: RummikubGroup[]; rack: string[] } {
  const onTable = tableIdSet(table)
  const rack = rackOrder.filter((id) => !onTable.has(id))
  return {
    table: table.map((g) => ({ id: g.id, tileIds: orderGroupIds(g.tileIds, view.tiles) })),
    rack
  }
}
