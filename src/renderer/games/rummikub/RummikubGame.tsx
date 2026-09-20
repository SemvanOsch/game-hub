import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
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

/** Content signature of a table, independent of group order/ids. */
function tableSig(t: readonly RummikubGroup[]): string {
  return t
    .map((g) => [...g.tileIds].sort().join(','))
    .sort()
    .join('|')
}

/** Whether two tables hold the same tiles in the same groups. */
function sameTable(a: readonly RummikubGroup[], b: readonly RummikubGroup[]): boolean {
  return tableSig(a) === tableSig(b)
}

const PREVIEW_CLEARED = 'CLEAR'

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
  /** Where a dragged tile would drop in the rack: a tile id, '__end__', or null. */
  const [rackDropTarget, setRackDropTarget] = useState<string | null>(null)
  const dragRef = useRef<string[]>([])
  const rackOrderRef = useRef(rackOrder)
  rackOrderRef.current = rackOrder
  const snapshotRef = useRef<Snapshot>({ table: cloneTable(state.table), rackOrder })
  /** Signature of the last preview we broadcast, so we don't spam identical ones. */
  const lastSentRef = useRef<string>(PREVIEW_CLEARED)

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
    setRackDropTarget(null)
    snapshotRef.current = { table: cloneTable(state.table), rackOrder: reconciled }
    lastSentRef.current = PREVIEW_CLEARED
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnCount, state.status])

  // Spectators: mirror the authoritative table live, so an opponent's
  // in-progress rearranging (their broadcast draft) shows up in real time.
  useEffect(() => {
    if (!yourTurn) setTable(cloneTable(state.table))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, yourTurn])

  // Current player: broadcast the in-progress arrangement (debounced) so
  // opponents can watch. Sends a clear once the board matches the committed
  // state again (e.g. after Cancel). Never loops: our own echoes don't change
  // the local `table`.
  useEffect(() => {
    if (!yourTurn) return
    const handle = setTimeout(() => {
      const isCommitted = sameTable(table, state.table)
      const toSend = isCommitted ? PREVIEW_CLEARED : tableSig(table)
      if (toSend === lastSentRef.current) return
      lastSentRef.current = toSend
      if (isCommitted) sendAction({ type: 'clear_preview' })
      else sendAction({ type: 'preview', table: table.map((g) => ({ id: g.id, tileIds: [...g.tileIds] })) })
    }, 120)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, yourTurn])

  const originalRack = useMemo(() => new Set(state.rack.map((t) => t.id)), [state.rack])
  const evaluation = useMemo(() => evaluateTurn(state, table), [state, table])
  const addedIds = useMemo(() => new Set(state.lastAdded), [state.lastAdded])
  const movedIds = useMemo(() => new Set(state.lastMoved), [state.lastMoved])

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
    setRackDropTarget(null)
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
          ) : state.previewBy ? (
            <span className={styles.rearranging}>
              {nameOf(state.previewBy)} is rearranging the table…
            </span>
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
        className={[styles.table, yourTurn ? styles.tableYourTurn : ''].filter(Boolean).join(' ')}
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
                addedIds={addedIds}
                movedIds={movedIds}
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
        <button
          type="button"
          className={styles.pool}
          onClick={draw}
          disabled={!yourTurn || dirty || state.poolCount === 0}
          title={
            !yourTurn
              ? 'Wait for your turn'
              : dirty
                ? 'Cancel your current play to draw instead'
                : state.poolCount === 0
                  ? 'The draw pool is empty'
                  : 'Draw a tile and end your turn'
          }
          aria-label={`Draw pool: ${state.poolCount} tiles${yourTurn && !dirty ? ' — click to draw' : ''}`}
        >
          <div className={styles.poolStack} aria-hidden>
            <RummikubTile tile={{ id: 'pool', isJoker: false }} faceDown size="sm" />
            <RummikubTile tile={{ id: 'pool2', isJoker: false }} faceDown size="sm" />
            <RummikubTile tile={{ id: 'pool3', isJoker: false }} faceDown size="sm" />
          </div>
          <div className={styles.poolLabel}>
            <span className={styles.poolCount}>{state.poolCount}</span>
            <span className={styles.poolText}>
              {yourTurn && !dirty && state.poolCount > 0 ? 'draw a tile' : 'in pool'}
            </span>
          </div>
        </button>

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
            onDragOver={(e) => {
              allowRackDrop(e)
              if (e.target === e.currentTarget) setRackDropTarget('__end__')
            }}
            onDragLeave={(e) => {
              // Only clear when the pointer actually leaves the rack area.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setRackDropTarget(null)
            }}
            onDrop={(e) => {
              if (e.target === e.currentTarget) dropOnRack(null)
            }}
          >
            {rackTiles.length === 0 ? (
              <span className={styles.rackEmpty}>No tiles — you’ve laid everything down!</span>
            ) : (
              rackTiles.map((tile) => (
                <Fragment key={tile.id}>
                  {rackDropTarget === tile.id ? <div className={styles.dropMarker} aria-hidden /> : null}
                  <div
                    className={styles.rackSlot}
                    onDragOver={(e) => {
                      allowRackDrop(e)
                      setRackDropTarget(tile.id)
                    }}
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
                      onDragEnd={endDrag}
                    />
                  </div>
                </Fragment>
              ))
            )}
            {rackDropTarget === '__end__' && rackTiles.length > 0 ? (
              <div className={styles.dropMarker} aria-hidden />
            ) : null}
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
            <span className={styles.waitBig}>
              {state.previewBy
                ? `${nameOf(state.previewBy)} is rearranging the table…`
                : `${nameOf(state.currentPlayerId)} is playing…`}
            </span>
          )}
        </div>
      </div>
      {yourTurn && dirty && !evaluation.canFinish ? (
        <p className={styles.reason}>{evaluation.reason}</p>
      ) : null}
    </div>
  )
}
