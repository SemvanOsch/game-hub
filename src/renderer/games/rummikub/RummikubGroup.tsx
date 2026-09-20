import type { DragEvent } from 'react'
import { useState } from 'react'
import { orderRunTiles, resolveGroup } from '@shared/rummikub/rules'
import type { RummikubGroup as Group, RummikubTile as Tile } from '@shared/rummikub/types'
import { RummikubTile } from './RummikubTile'
import styles from './RummikubGroup.module.css'

export interface RummikubGroupProps {
  group: Group
  tiles: Record<string, Tile>
  editable: boolean
  /** True when this group is not a legal run/set right now (highlight red). */
  invalid: boolean
  selectedIds: Set<string>
  /** Tile ids added last turn (green) and moved last turn (orange). */
  addedIds: ReadonlySet<string>
  movedIds: ReadonlySet<string>
  onTileClick: (id: string) => void
  onTileDragStart: (id: string, e: DragEvent<HTMLDivElement>) => void
  /** Drop the currently dragged tiles into this group. */
  onDropTiles: (groupId: string) => void
  /** Click the group background (not a tile) — used to move the selection here. */
  onGroupClick: (groupId: string) => void
}

/**
 * A single group laid on the table. Shows its tiles in order, labels whether it
 * reads as a run or a set (with its point value), and acts as a drop target for
 * tiles dragged from the rack or other groups during the local player's turn.
 */
export function RummikubGroup({
  group,
  tiles,
  editable,
  invalid,
  selectedIds,
  addedIds,
  movedIds,
  onTileClick,
  onTileDragStart,
  onDropTiles,
  onGroupClick
}: RummikubGroupProps) {
  const [dragOver, setDragOver] = useState(false)
  const rawTiles = group.tileIds.map((id) => tiles[id]).filter(Boolean)
  const resolved = resolveGroup(rawTiles)
  // A valid run always reads left-to-right in ascending order (jokers in gaps),
  // so "8 6 7" is shown as "6 7 8". Anything else keeps its placement order.
  const groupTiles = (resolved?.kind === 'run' ? orderRunTiles(rawTiles) : null) ?? rawTiles

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!editable) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dragOver) setDragOver(true)
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!editable) return
    e.preventDefault()
    setDragOver(false)
    onDropTiles(group.id)
  }

  return (
    <div
      className={[
        styles.group,
        invalid ? styles.invalid : '',
        dragOver ? styles.dragOver : '',
        editable ? styles.editable : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={editable ? () => onGroupClick(group.id) : undefined}
    >
      <div className={styles.tiles}>
        {groupTiles.map((tile) => (
          <RummikubTile
            key={tile.id}
            tile={tile}
            size="md"
            selected={selectedIds.has(tile.id)}
            mark={addedIds.has(tile.id) ? 'added' : movedIds.has(tile.id) ? 'moved' : undefined}
            draggable={editable}
            onClick={
              editable
                ? (e) => {
                    e.stopPropagation()
                    onTileClick(tile.id)
                  }
                : undefined
            }
            onDragStart={editable ? (e) => onTileDragStart(tile.id, e) : undefined}
          />
        ))}
      </div>
      <div className={styles.label}>
        {resolved ? (
          <span className={styles.kind}>
            {resolved.kind === 'run' ? 'Run' : 'Set'} · {resolved.value}
          </span>
        ) : (
          <span className={styles.badKind}>Invalid</span>
        )}
      </div>
    </div>
  )
}
