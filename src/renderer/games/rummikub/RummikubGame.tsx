import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { RummikubGroup } from '@shared/rummikub/types'
import type { RummikubView } from '@shared/rummikub/view'
import { Button } from '../../components/Button'
import type { GameUIProps } from '../ui'
import { RummikubTile } from './RummikubTile'
import { RummikubGroup as GroupView } from './RummikubGroup'
import {
  cloneTable,
  evaluateTurn,
  moveToGroup,
  moveToNewGroup,
  reconcileRack,
  removeFromTable,
  reorderRack,
  sortRack,
  tableIdSet,
  toFinishPayload
} from './tableModel'
import styles from './RummikubGame.module.css'

interface Snapshot {
  table: RummikubGroup[]
  rackOrder: string[]
}

/** Group-signature comparison so we can tell whether the table has been edited. */
function sameTable(a: readonly RummikubGroup[], b: readonly RummikubGroup[]): boolean {
  const sig = (t: readonly RummikubGroup[]) =>
    t
      .map((g) => [...g.tileIds].sort().join(','))
      .sort()
      .join('|')
  return sig(a) === sig(b)
}

export function RummikubGame({ room, view, sendAction, onLeave }: GameUIProps) {
  const state = view as RummikubView
  const nameById = useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players])
  const connectedById = useMemo(
    () => new Map(room.players.map((p) => [p.id, p.connected])),
    [room.players]
  )
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const yourTurn = state.yourTurn

  // Persistent hand ordering (survives opponents' moves) + turn-scoped table copy.
  const [rackOrder, setRackOrder] = useState<string[]>(() => state.rack.map((t) => t.id))
  const [table, setTable] = useState<RummikubGroup[]>(() => cloneTable(state.table))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const dragRef = useRef<string[]>([])
  const rackOrderRef = useRef(rackOrder)
  rackOrderRef.current = rackOrder
  const snapshotRef = useRef<Snapshot>({ table: cloneTable(state.table), rackOrder })

  // On every authoritative update (our commit, an opponent's move, a draw), sync
  // the table and reconcile the rack membership — while preserving the player's
  // own rack ordering. Local rack tidying done between updates is never lost.
  useEffect(() => {
    const handIds = state.rack.map((t) => t.id)
    const reconciled = reconcileRack(rackOrderRef.current, handIds)
    setRackOrder(reconciled)
    rackOrderRef.current = reconciled
    setTable(cloneTable(state.table))
    setSelected(new Set())
    snapshotRef.current = { table: cloneTable(state.table), rackOrder: reconciled }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnCount, state.status])

  const originalRack = useMemo(() => new Set(state.rack.map((t) => t.id)), [state.rack])
  const evaluation = useMemo(() => evaluateTurn(state, table), [state, table])

  const onTable = useMemo(() => tableIdSet(table), [table])
  const rackTiles = useMemo(
    () => rackOrder.filter((id) => !onTable.has(id)).map((id) => state.tiles[id]).filter(Boolean),
    [rackOrder, onTable, state.tiles]
  )

  const dirty = useMemo(
    () => evaluation.playedCount > 0 || !sameTable(table, state.table),
    [evaluation.playedCount, table, state.table]
  )

  // --- Selection & moves ----------------------------------------------------

  const clearSelection = () => setSelected(new Set())
  const endDrag = () => {
    dragRef.current = []
  }

  const toggleSelect = (id: string) => {
    if (!yourTurn) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const dragIdsFor = (id: string): string[] => {
    if (selected.has(id) && selected.size > 0) return Array.from(selected)
    if (yourTurn) setSelected(new Set([id]))
    return [id]
  }
  const onTileDragStart = (id: string, e: DragEvent<HTMLDivElement>) => {
    const ids = dragIdsFor(id)
    dragRef.current = ids
    e.dataTransfer.setData('text/plain', ids.join(','))
    e.dataTransfer.effectAllowed = 'move'
  }
  const draggedIds = (): string[] => (dragRef.current.length > 0 ? dragRef.current : Array.from(selected))

  const applyToGroup = (groupId: string, ids: string[]) => {
    if (!yourTurn || ids.length === 0) return
    setTable((t) => moveToGroup(t, ids, groupId))
    clearSelection()
    endDrag()
  }
  const applyToNewGroup = (ids: string[]) => {
    if (!yourTurn || ids.length === 0) return
    setTable((t) => moveToNewGroup(t, ids))
    clearSelection()
    endDrag()
  }
  /** Return tiles to the rack (only rack-origin tiles), positioned near `beforeId`. */
  const returnToRack = (ids: string[], beforeId: string | null) => {
    const allowed = ids.filter((id) => originalRack.has(id))
    if (allowed.length === 0) return
    setTable((t) => removeFromTable(t, new Set(allowed)))
    setRackOrder((r) => reorderRack(r, allowed, beforeId))
    clearSelection()
    endDrag()
  }

  const onDropGroup = (groupId: string) => applyToGroup(groupId, draggedIds())
  const onGroupClick = (groupId: string) => {
    if (yourTurn && selected.size > 0) applyToGroup(groupId, Array.from(selected))
  }
  const onDropNewGroup = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    applyToNewGroup(draggedIds())
  }

  /** A drop landing on the rack: reorder rack tiles and/or return table tiles. */
  const dropOnRack = (beforeId: string | null) => {
    const ids = draggedIds()
    if (ids.length === 0) return
    const fromRack = ids.filter((id) => !onTable.has(id))
    const fromTable = ids.filter((id) => onTable.has(id))
    if (fromRack.length > 0) setRackOrder((r) => reorderRack(r, fromRack, beforeId))
    if (fromTable.length > 0) returnToRack(fromTable, beforeId)
    clearSelection()
    endDrag()
  }

  const allowRackDrop = (e: DragEvent<HTMLDivElement>) => e.preventDefault()
  const allowTableDrop = (e: DragEvent<HTMLDivElement>) => {
    if (yourTurn) e.preventDefault()
  }

  // --- Turn actions ---------------------------------------------------------

  const finishTurn = () => {
    if (!evaluation.canFinish) return
    sendAction({ type: 'finish_turn', ...toFinishPayload(state, table, rackOrder) })
  }
  const draw = () => sendAction({ type: 'draw' })
  const cancelTurn = () => {
    setTable(cloneTable(snapshotRef.current.table))
    setRackOrder([...snapshotRef.current.rackOrder])
    clearSelection()
    endDrag()
  }

  const selectionArr = Array.from(selected)
  const selectionReturnable = selectionArr.filter((id) => originalRack.has(id) && onTable.has(id))

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave game
        </button>
        <div className={styles.turnBanner} role="status" aria-live="polite">
          {yourTurn ? (
            <span className={styles.yourTurn}>Your turn</span>
          ) : (
            <span className={styles.waiting}>Waiting for {nameOf(state.currentPlayerId)}…</span>
          )}
          {!state.selfHasOpened ? (
            <span className={styles.meldNote}>
              Not opened — first play must total {state.initialMeldRequirement}+
              {yourTurn && evaluation.needsMeld ? ` (now ${evaluation.meldValue})` : ''}
            </span>
          ) : null}
        </div>
      </div>

      {/* Players */}
      <div className={styles.players}>
        {state.players.map((p) => (
          <div
            key={p.playerId}
            className={[styles.playerChip, p.isCurrent ? styles.playerCurrent : '']
              .filter(Boolean)
              .join(' ')}
          >
            <div className={styles.playerTop}>
              <span className={styles.playerName}>
                {nameOf(p.playerId)}
                {p.isSelf ? ' (You)' : ''}
              </span>
              {!connectedById.get(p.playerId) ? (
                <span className={styles.offline}>offline</span>
              ) : null}
            </div>
            <div className={styles.playerMeta}>
              <span className={styles.tileCount}>{p.tileCount} tiles</span>
              <span className={p.hasOpened ? styles.opened : styles.notOpened}>
                {p.hasOpened ? 'Opened' : 'Not opened'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        className={styles.table}
        onDragOver={allowTableDrop}
        onDrop={(e) => {
          if (e.target === e.currentTarget) onDropNewGroup(e)
        }}
      >
        {table.length === 0 ? (
          <p className={styles.emptyTable}>
            The table is empty. Drag tiles here (or select them and use “New group”) to lay down
            your first meld.
          </p>
        ) : (
          <div className={styles.groups}>
            {table.map((group) => (
              <GroupView
                key={group.id}
                group={group}
                tiles={state.tiles}
                editable={yourTurn}
                invalid={evaluation.invalidGroupIds.includes(group.id)}
                selectedIds={selected}
                onTileClick={toggleSelect}
                onTileDragStart={onTileDragStart}
                onDropTiles={onDropGroup}
                onGroupClick={onGroupClick}
              />
            ))}
            {yourTurn ? (
              <div
                className={styles.newGroup}
                onDragOver={allowTableDrop}
                onDrop={onDropNewGroup}
                onClick={() => selected.size > 0 && applyToNewGroup(Array.from(selected))}
              >
                <span>＋ New group</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Pool + rack */}
      <div className={styles.bottom}>
        <div className={styles.pool} aria-label={`Draw pool: ${state.poolCount} tiles`}>
          <div className={styles.poolStack} aria-hidden>
            <RummikubTile tile={{ id: 'pool', isJoker: false }} faceDown size="sm" />
            <RummikubTile tile={{ id: 'pool2', isJoker: false }} faceDown size="sm" />
            <RummikubTile tile={{ id: 'pool3', isJoker: false }} faceDown size="sm" />
          </div>
          <div className={styles.poolLabel}>
            <span className={styles.poolCount}>{state.poolCount}</span>
            <span className={styles.poolText}>in pool</span>
          </div>
        </div>

        <div className={styles.rackArea}>
          <div className={styles.rackHead}>
            <span className={styles.rackTitle}>Your rack · {rackTiles.length}</span>
            <div className={styles.sortBtns}>
              <button
                className={styles.sortBtn}
                onClick={() => setRackOrder((r) => sortRack(r, state.tiles, 'number'))}
              >
                Sort ▸ number
              </button>
              <button
                className={styles.sortBtn}
                onClick={() => setRackOrder((r) => sortRack(r, state.tiles, 'color'))}
              >
                Sort ▸ colour
              </button>
            </div>
          </div>
          <div
            className={styles.rack}
            onDragOver={allowRackDrop}
            onDrop={(e) => {
              if (e.target === e.currentTarget) dropOnRack(null)
            }}
          >
            {rackTiles.length === 0 ? (
              <span className={styles.rackEmpty}>No tiles — you’ve laid everything down!</span>
            ) : (
              rackTiles.map((tile) => (
                <div
                  key={tile.id}
                  className={styles.rackSlot}
                  onDragOver={allowRackDrop}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    dropOnRack(tile.id)
                  }}
                >
                  <RummikubTile
                    tile={tile}
                    size="md"
                    selected={selected.has(tile.id)}
                    draggable
                    onClick={yourTurn ? () => toggleSelect(tile.id) : undefined}
                    onDragStart={(e) => onTileDragStart(tile.id, e)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className={styles.actions}>
        <div className={styles.actionLeft}>
          {yourTurn && selected.size > 0 ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => applyToNewGroup(selectionArr)}>
                New group ({selected.size})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => returnToRack(selectionReturnable, null)}
                disabled={selectionReturnable.length === 0}
              >
                Return to rack
              </Button>
              <button className={styles.clearSel} onClick={clearSelection}>
                Clear
              </button>
            </>
          ) : (
            <span className={styles.hint}>
              {yourTurn
                ? 'Select or drag tiles to build runs and sets.'
                : 'Rearrange your rack while you wait for your turn.'}
            </span>
          )}
        </div>

        <div className={styles.actionRight}>
          {yourTurn ? (
            <>
              <Button size="md" variant="ghost" onClick={cancelTurn}>
                Cancel
              </Button>
              <Button size="md" variant="secondary" onClick={draw} disabled={dirty}>
                Draw tile
              </Button>
              <Button size="md" onClick={finishTurn} disabled={!evaluation.canFinish}>
                Finish turn
              </Button>
            </>
          ) : (
            <span className={styles.waitBig}>{nameOf(state.currentPlayerId)} is playing…</span>
          )}
        </div>
      </div>
      {yourTurn && dirty && !evaluation.canFinish ? (
        <p className={styles.reason}>{evaluation.reason}</p>
      ) : null}
    </div>
  )
}
