import { describe, expect, it } from 'vitest'
import {
  clearPreview,
  createGame,
  drawTile,
  finishTurn,
  removePlayerFromGame,
  setPreview,
  type RummikubGameState,
  type RummikubServerPlayer
} from './engine'
import { getPlayerView } from './view'
import type { RummikubColor, RummikubGroup, RummikubTile } from './types'

let seq = 0
function t(color: RummikubColor, value: number): RummikubTile {
  return { id: `${color}${value}#${seq++}`, color, value, isJoker: false }
}
function joker(): RummikubTile {
  return { id: `joker#${seq++}`, isJoker: true }
}

interface StateOpts {
  racks: Record<string, RummikubTile[]>
  table?: RummikubTile[][]
  pool?: RummikubTile[]
  current?: string
  opened?: string[]
  order?: string[]
}

/** Build a deterministic game state from explicit tiles for reducer testing. */
function makeState(opts: StateOpts): RummikubGameState {
  const order = opts.order ?? Object.keys(opts.racks)
  const table: RummikubGroup[] = (opts.table ?? []).map((tiles, i) => ({
    id: `g${i}`,
    tileIds: tiles.map((t) => t.id)
  }))
  const pool = opts.pool ?? []

  const tilesById: Record<string, RummikubTile> = {}
  for (const rack of Object.values(opts.racks)) for (const tile of rack) tilesById[tile.id] = tile
  for (const group of opts.table ?? []) for (const tile of group) tilesById[tile.id] = tile
  for (const tile of pool) tilesById[tile.id] = tile

  const players: Record<string, RummikubServerPlayer> = {}
  for (const id of order) {
    players[id] = {
      playerId: id,
      rack: (opts.racks[id] ?? []).map((t) => t.id),
      hasOpened: opts.opened?.includes(id) ?? false
    }
  }

  return {
    status: 'playing',
    playerOrder: order,
    players,
    table,
    pool: pool.map((t) => t.id),
    tilesById,
    currentPlayerId: opts.current ?? order[0],
    turnCount: 0,
    groupIdSeq: (opts.table ?? []).length
  }
}

/** Convenience: build a finish_turn proposed table from tile arrays. */
function groups(...tileGroups: RummikubTile[][]): RummikubGroup[] {
  return tileGroups.map((tiles, i) => ({ id: `p${i}`, tileIds: tiles.map((t) => t.id) }))
}

describe('createGame', () => {
  it('deals 14 tiles to each player and pools the remainder', () => {
    const state = createGame(['a', 'b', 'c'])
    expect(state.players.a.rack).toHaveLength(14)
    expect(state.players.b.rack).toHaveLength(14)
    expect(state.players.c.rack).toHaveLength(14)
    expect(state.pool).toHaveLength(106 - 3 * 14)
    expect(state.table).toEqual([])
    expect(state.status).toBe('playing')
  })

  it('starts with a player from the order and nobody opened', () => {
    const state = createGame(['a', 'b'])
    expect(state.playerOrder).toContain(state.currentPlayerId)
    expect(state.players.a.hasOpened).toBe(false)
    expect(state.players.b.hasOpened).toBe(false)
  })

  it('assigns every dealt/pooled tile a unique id', () => {
    const state = createGame(['a', 'b', 'c', 'd'])
    const all = [
      ...Object.values(state.players).flatMap((p) => p.rack),
      ...state.pool
    ]
    expect(new Set(all).size).toBe(106)
  })
})

describe('initial meld', () => {
  it('rejects a first play below 30 points', () => {
    const r1 = t('red', 1)
    const r2 = t('red', 2)
    const r3 = t('red', 3)
    const state = makeState({ racks: { a: [r1, r2, r3], b: [] }, current: 'a' })
    const res = finishTurn(state, 'a', groups([r1, r2, r3]), [])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/30 points/)
  })

  it('accepts a first play of exactly 30 and opens the player', () => {
    // red 9,10,11 = 30
    const r9 = t('red', 9)
    const r10 = t('red', 10)
    const r11 = t('red', 11)
    const spare = t('blue', 2)
    const state = makeState({ racks: { a: [r9, r10, r11, spare], b: [] }, current: 'a' })
    const res = finishTurn(state, 'a', groups([r9, r10, r11]), [spare.id])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.state.players.a.hasOpened).toBe(true)
      expect(res.state.currentPlayerId).toBe('b')
    }
  })

  it('accepts a first play above 30', () => {
    const r10 = t('red', 10)
    const r11 = t('red', 11)
    const r12 = t('red', 12)
    const spare = t('blue', 2)
    const state = makeState({ racks: { a: [r10, r11, r12, spare], b: [] }, current: 'a' })
    const res = finishTurn(state, 'a', groups([r10, r11, r12]), [spare.id])
    expect(res.ok).toBe(true)
  })

  it('accepts multiple groups adding up to 30', () => {
    // set of 7s (21) + run red 1,2,3? = 6 -> 27, not enough; use set 7s (21) + set 3s (9) = 30
    const r7 = t('red', 7)
    const b7 = t('blue', 7)
    const k7 = t('black', 7)
    const r3 = t('red', 3)
    const b3 = t('blue', 3)
    const k3 = t('black', 3)
    const state = makeState({ racks: { a: [r7, b7, k7, r3, b3, k3], b: [] }, current: 'a' })
    const res = finishTurn(state, 'a', groups([r7, b7, k7], [r3, b3, k3]), [])
    expect(res.ok).toBe(true)
  })

  it('does not let existing table tiles count toward the 30', () => {
    // Table already has a red 10,11,12 run; player a tries to "open" by adding a
    // single red 9 to it — that touches the table before opening, so it's illegal.
    const tr10 = t('red', 10)
    const tr11 = t('red', 11)
    const tr12 = t('red', 12)
    const r9 = t('red', 9)
    const state = makeState({
      racks: { a: [r9], b: [] },
      table: [[tr10, tr11, tr12]],
      current: 'a'
    })
    const res = finishTurn(state, 'a', groups([r9, tr10, tr11, tr12]), [])
    expect(res.ok).toBe(false)
  })

  it('counts a joker at the value it represents in the meld', () => {
    // red 10, joker(11), red 12 = 33 >= 30
    const r10 = t('red', 10)
    const j = joker()
    const r12 = t('red', 12)
    const state = makeState({ racks: { a: [r10, j, r12], b: [] }, current: 'a' })
    const res = finishTurn(state, 'a', groups([r10, j, r12]), [])
    expect(res.ok).toBe(true)
  })
})

describe('table manipulation (opened players)', () => {
  it('extends an existing run with a rack tile', () => {
    const tr3 = t('red', 3)
    const tr4 = t('red', 4)
    const tr5 = t('red', 5)
    const r6 = t('red', 6)
    const state = makeState({
      racks: { a: [r6], b: [] },
      table: [[tr3, tr4, tr5]],
      current: 'a',
      opened: ['a']
    })
    const res = finishTurn(state, 'a', groups([tr3, tr4, tr5, r6]), [])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.state.table[0].tileIds).toContain(r6.id)
  })

  it('splits a run and reuses table tiles with a rack tile', () => {
    // Table: red 3,4,5,6. Rack: blue 6, black 6.
    // Rearrange into red 3,4,5 and a set of 6s (red 6 + blue 6 + black 6).
    const tr3 = t('red', 3)
    const tr4 = t('red', 4)
    const tr5 = t('red', 5)
    const tr6 = t('red', 6)
    const b6 = t('blue', 6)
    const k6 = t('black', 6)
    const state = makeState({
      racks: { a: [b6, k6], b: [] },
      table: [[tr3, tr4, tr5, tr6]],
      current: 'a',
      opened: ['a']
    })
    const res = finishTurn(state, 'a', groups([tr3, tr4, tr5], [tr6, b6, k6]), [])
    expect(res.ok).toBe(true)
  })

  it('rejects a final state with an invalid group', () => {
    const tr3 = t('red', 3)
    const tr4 = t('red', 4)
    const tr5 = t('red', 5)
    const b9 = t('blue', 9)
    const state = makeState({
      racks: { a: [b9], b: [] },
      table: [[tr3, tr4, tr5]],
      current: 'a',
      opened: ['a']
    })
    // Adding blue 9 to a red run makes it invalid.
    const res = finishTurn(state, 'a', groups([tr3, tr4, tr5, b9]), [])
    expect(res.ok).toBe(false)
  })

  it('requires at least one rack tile to be played', () => {
    const tr3 = t('red', 3)
    const tr4 = t('red', 4)
    const tr5 = t('red', 5)
    const spare = t('blue', 2)
    const state = makeState({
      racks: { a: [spare], b: [] },
      table: [[tr3, tr4, tr5]],
      current: 'a',
      opened: ['a']
    })
    // Just re-submitting the table without playing anything is not a valid finish.
    const res = finishTurn(state, 'a', groups([tr3, tr4, tr5]), [spare.id])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/at least one tile/)
  })
})

describe('jokers', () => {
  it('allows a joker replacement used within the same turn', () => {
    // Table: red 5, joker(=6), red 7. Rack: real red 6 and red 8.
    // Player swaps the real red 6 in for the joker, then uses the joker to
    // extend the run as an 8 -> red 5,6,7,8 (joker as 8). All accounted for.
    const tr5 = t('red', 5)
    const j = joker()
    const tr7 = t('red', 7)
    const r6 = t('red', 6)
    const state = makeState({
      racks: { a: [r6], b: [] },
      table: [[tr5, j, tr7]],
      current: 'a',
      opened: ['a']
    })
    // New arrangement: red 5,6,7,joker(as 8)
    const res = finishTurn(state, 'a', groups([tr5, r6, tr7, j]), [])
    expect(res.ok).toBe(true)
  })

  it('rejects taking a freed joker onto the rack', () => {
    const tr5 = t('red', 5)
    const j = joker()
    const tr7 = t('red', 7)
    const r6 = t('red', 6)
    const state = makeState({
      racks: { a: [r6], b: [] },
      table: [[tr5, j, tr7]],
      current: 'a',
      opened: ['a']
    })
    // Replace joker with the real 6 but try to pocket the joker.
    const res = finishTurn(state, 'a', groups([tr5, r6, tr7]), [j.id])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/table onto your rack/)
  })
})

describe('draw', () => {
  it('moves one pool tile to the rack and ends the turn', () => {
    const poolTile = t('orange', 5)
    const state = makeState({
      racks: { a: [t('red', 1)], b: [] },
      pool: [poolTile],
      current: 'a'
    })
    const res = drawTile(state, 'a')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.state.players.a.rack).toContain(poolTile.id)
      expect(res.state.pool).toHaveLength(0)
      expect(res.state.currentPlayerId).toBe('b')
    }
  })

  it('passes the turn cleanly when the pool is empty', () => {
    const state = makeState({ racks: { a: [t('red', 1)], b: [] }, pool: [], current: 'a' })
    const res = drawTile(state, 'a')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.state.players.a.rack).toHaveLength(1)
      expect(res.state.currentPlayerId).toBe('b')
    }
  })

  it('rejects drawing out of turn', () => {
    const state = makeState({ racks: { a: [], b: [] }, pool: [t('red', 1)], current: 'a' })
    const res = drawTile(state, 'b')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_YOUR_TURN')
  })
})

describe('win condition', () => {
  it('declares the winner when the rack is emptied on a valid turn', () => {
    const r9 = t('red', 9)
    const r10 = t('red', 10)
    const r11 = t('red', 11)
    const state = makeState({
      racks: { a: [r9, r10, r11], b: [t('blue', 4), joker()] },
      current: 'a',
      opened: ['a']
    })
    const res = finishTurn(state, 'a', groups([r9, r10, r11]), [])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.state.status).toBe('finished')
      expect(res.state.winnerId).toBe('a')
      // b keeps blue 4 (4) + joker (30) = 34 penalty; a scores +34.
      expect(res.state.scores).toEqual({ a: 34, b: -34 })
    }
  })

  it('does not let an invalid final table trigger a win', () => {
    const r3 = t('red', 3)
    const b9 = t('blue', 9)
    const state = makeState({ racks: { a: [r3, b9], b: [] }, current: 'a', opened: ['a'] })
    // Two tiles cannot form any valid group, so emptying the rack this way fails.
    const res = finishTurn(state, 'a', groups([r3, b9]), [])
    expect(res.ok).toBe(false)
    expect(state.status).toBe('playing')
  })
})

describe('multiplayer security', () => {
  const base = () => {
    const r9 = t('red', 9)
    const r10 = t('red', 10)
    const r11 = t('red', 11)
    const oppTile = t('blue', 5)
    const state = makeState({
      racks: { a: [r9, r10, r11], b: [oppTile] },
      current: 'a',
      opened: ['a']
    })
    return { state, r9, r10, r11, oppTile }
  }

  it('rejects an out-of-turn finish', () => {
    const { state, oppTile } = base()
    const res = finishTurn(state, 'b', groups([oppTile]), [])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_YOUR_TURN')
  })

  it('rejects an unknown / fabricated tile id', () => {
    const { state, r9, r10 } = base()
    const fake: RummikubGroup[] = [{ id: 'p', tileIds: [r9.id, r10.id, 'made-up-tile'] }]
    const res = finishTurn(state, 'a', fake, [])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/unknown tile/)
  })

  it("rejects playing another player's tile", () => {
    const { state, r9, r10, oppTile } = base()
    // a tries to use b's tile in a group.
    const res = finishTurn(state, 'a', groups([r9, r10, oppTile]), ['x'])
    expect(res.ok).toBe(false)
  })

  it('rejects duplicating a tile', () => {
    const { state, r9, r10, r11 } = base()
    // r9 appears twice — once on the table, once kept in hand.
    const dup: RummikubGroup[] = [{ id: 'p', tileIds: [r9.id, r10.id, r11.id] }]
    const res = finishTurn(state, 'a', dup, [r9.id])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/two places|lost or added/)
  })

  it('rejects losing a tile (conservation)', () => {
    const { state, r9, r10 } = base()
    // r11 vanishes entirely.
    const res = finishTurn(state, 'a', groups([r9, r10]), [])
    expect(res.ok).toBe(false)
  })
})

describe('last-turn change tracking', () => {
  it('flags tiles played from the rack as added, with nothing moved', () => {
    const r9 = t('red', 9)
    const r10 = t('red', 10)
    const r11 = t('red', 11)
    const state = makeState({ racks: { a: [r9, r10, r11], b: [] }, current: 'a', opened: ['a'] })
    const res = finishTurn(state, 'a', groups([r9, r10, r11]), [])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(new Set(res.state.lastAdded)).toEqual(new Set([r9.id, r10.id, r11.id]))
      expect(res.state.lastMoved).toEqual([])
    }
  })

  it('marks only the new tile when extending a run (untouched tiles are not moved)', () => {
    const tr3 = t('red', 3)
    const tr4 = t('red', 4)
    const tr5 = t('red', 5)
    const r6 = t('red', 6)
    const state = makeState({
      racks: { a: [r6], b: [] },
      table: [[tr3, tr4, tr5]],
      current: 'a',
      opened: ['a']
    })
    const res = finishTurn(state, 'a', groups([tr3, tr4, tr5, r6]), [])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.state.lastAdded).toEqual([r6.id])
      expect(res.state.lastMoved).toEqual([])
    }
  })

  it('marks split-off table tiles as moved', () => {
    const tr3 = t('red', 3)
    const tr4 = t('red', 4)
    const tr5 = t('red', 5)
    const tr6 = t('red', 6)
    const b6 = t('blue', 6)
    const k6 = t('black', 6)
    const state = makeState({
      racks: { a: [b6, k6], b: [] },
      table: [[tr3, tr4, tr5, tr6]],
      current: 'a',
      opened: ['a']
    })
    // Split red 3-4-5-6 into red 3-4-5 and a set of 6s (red6 + blue6 + black6).
    const res = finishTurn(state, 'a', groups([tr3, tr4, tr5], [tr6, b6, k6]), [])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(new Set(res.state.lastAdded)).toEqual(new Set([b6.id, k6.id]))
      // tr6 lost its run-mates, tr3/4/5 lost tr6 → all four moved.
      expect(new Set(res.state.lastMoved)).toEqual(new Set([tr3.id, tr4.id, tr5.id, tr6.id]))
    }
  })

  it('clears change markers on a draw', () => {
    const state = makeState({
      racks: { a: [t('red', 1)], b: [] },
      pool: [t('orange', 5)],
      current: 'a'
    })
    state.lastAdded = ['stale']
    state.lastMoved = ['stale']
    const res = drawTile(state, 'a')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.state.lastAdded).toEqual([])
      expect(res.state.lastMoved).toEqual([])
    }
  })
})

describe('preview (live spectating)', () => {
  it('stores the current player’s draft without advancing the turn', () => {
    const r9 = t('red', 9)
    const r10 = t('red', 10)
    const r11 = t('red', 11)
    const state = makeState({ racks: { a: [r9, r10, r11], b: [] }, current: 'a', opened: ['a'] })
    const res = setPreview(state, 'a', groups([r9, r10, r11]))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.state.draft?.playerId).toBe('a')
      expect(res.state.currentPlayerId).toBe('a')
      expect(res.state.turnCount).toBe(state.turnCount)
    }
  })

  it('rejects a preview from a player whose turn it is not', () => {
    const state = makeState({ racks: { a: [t('red', 9)], b: [t('blue', 5)] }, current: 'a' })
    const res = setPreview(state, 'b', [])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_YOUR_TURN')
  })

  it('rejects a preview that references tiles the player cannot touch', () => {
    const r9 = t('red', 9)
    const opp = t('blue', 5)
    const state = makeState({ racks: { a: [r9], b: [opp] }, current: 'a' })
    // a tries to preview using b's tile.
    const res = setPreview(state, 'a', groups([r9, opp]))
    expect(res.ok).toBe(false)
  })

  it('shows the draft to spectators but not to the drafter, and hides it after commit', () => {
    const r9 = t('red', 9)
    const r10 = t('red', 10)
    const r11 = t('red', 11)
    const spare = t('blue', 2)
    const state = makeState({ racks: { a: [r9, r10, r11, spare], b: [] }, current: 'a', opened: ['a'] })
    const previewed = setPreview(state, 'a', groups([r9, r10, r11]))
    expect(previewed.ok).toBe(true)
    if (!previewed.ok) return

    // Spectator b sees the in-progress arrangement and who is doing it.
    const bView = getPlayerView(previewed.state, 'b')
    expect(bView.previewBy).toBe('a')
    expect(bView.table.flatMap((g) => g.tileIds)).toContain(r9.id)
    expect(bView.tiles[r9.id]).toBeDefined()

    // The drafter still sees the committed (empty) table.
    const aView = getPlayerView(previewed.state, 'a')
    expect(aView.previewBy).toBeUndefined()
    expect(aView.table).toEqual([])
  })

  it('clears the draft when the turn is committed', () => {
    const r9 = t('red', 9)
    const r10 = t('red', 10)
    const r11 = t('red', 11)
    const state = makeState({ racks: { a: [r9, r10, r11], b: [] }, current: 'a', opened: ['a'] })
    const previewed = setPreview(state, 'a', groups([r9, r10, r11]))
    expect(previewed.ok).toBe(true)
    if (!previewed.ok) return
    const committed = finishTurn(previewed.state, 'a', groups([r9, r10, r11]), [])
    expect(committed.ok).toBe(true)
    if (committed.ok) expect(committed.state.draft).toBeUndefined()
  })

  it('clearPreview removes an in-progress draft', () => {
    const r9 = t('red', 9)
    const state = makeState({ racks: { a: [r9], b: [] }, current: 'a', opened: ['a'] })
    const previewed = setPreview(state, 'a', groups([r9]))
    if (!previewed.ok) throw new Error('preview failed')
    const cleared = clearPreview(previewed.state, 'a')
    expect(cleared.ok).toBe(true)
    if (cleared.ok) expect(cleared.state.draft).toBeUndefined()
  })
})

describe('removePlayerFromGame', () => {
  it('returns a leaver’s tiles to the pool and advances the turn', () => {
    const rackA = [t('red', 1), t('red', 2)]
    const state = makeState({
      racks: { a: rackA, b: [t('blue', 5)], c: [t('black', 9)] },
      pool: [t('orange', 7)],
      current: 'a',
      order: ['a', 'b', 'c']
    })
    const next = removePlayerFromGame(state, 'a')
    expect(next).not.toBeNull()
    if (next) {
      expect(next.playerOrder).toEqual(['b', 'c'])
      expect(next.pool).toHaveLength(3) // 1 original + 2 returned
      expect(next.currentPlayerId).toBe('b')
    }
  })

  it('declares the last remaining player the winner', () => {
    const state = makeState({
      racks: { a: [t('red', 1)], b: [t('blue', 5)] },
      current: 'a',
      order: ['a', 'b']
    })
    const next = removePlayerFromGame(state, 'a')
    expect(next?.status).toBe('finished')
    expect(next?.winnerId).toBe('b')
  })

  it('returns null when the last player leaves', () => {
    const state = makeState({ racks: { a: [t('red', 1)] }, current: 'a', order: ['a'] })
    expect(removePlayerFromGame(state, 'a')).toBeNull()
  })
})
