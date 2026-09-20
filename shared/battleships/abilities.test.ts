import { describe, expect, it } from 'vitest'
import {
  getBombTargets,
  getNukeTargets,
  getScatterTargets,
  initialAbilities,
  rewardForShipLost,
  type AbilityInventory
} from './abilities'
import {
  fireShot,
  useAbility,
  currentPlayerId,
  type BattleshipsBoard,
  type BattleshipsGameState
} from './engine'
import { battleshipsEngine } from './game'
import {
  BOARD_SIZE,
  coordinateKey,
  isInsideBoard,
  type Coordinate,
  type Orientation,
  type Ship,
  type ShipType
} from './types'

// --- helpers ---------------------------------------------------------------

function makeShip(
  type: ShipType,
  length: number,
  start: Coordinate,
  orientation: Orientation
): Ship {
  const positions: Coordinate[] = []
  for (let i = 0; i < length; i++) {
    positions.push({
      row: orientation === 'vertical' ? start.row + i : start.row,
      col: orientation === 'horizontal' ? start.col + i : start.col
    })
  }
  return { id: type, type, length, positions, hits: positions.map(() => false), sunk: false }
}

function makeBoard(ships: Ship[], abilities?: Partial<AbilityInventory>): BattleshipsBoard {
  return {
    ships,
    shots: [],
    abilities: { ...initialAbilities(), ...abilities },
    shipsDestroyedCount: 0
  }
}

function makeState(a: BattleshipsBoard, b: BattleshipsBoard, currentPlayerIndex = 0): BattleshipsGameState {
  return {
    status: 'playing',
    playerOrder: ['a', 'b'],
    currentPlayerIndex,
    boards: { a, b }
  }
}

function keys(cells: Coordinate[]): string[] {
  return cells.map((c) => coordinateKey(c))
}

function allUnique(cells: Coordinate[]): boolean {
  return new Set(keys(cells)).size === cells.length
}

// ===========================================================================
// Bombs geometry
// ===========================================================================

describe('getBombTargets', () => {
  it('returns the centre plus four orthogonal neighbours in the middle of the board', () => {
    const cells = getBombTargets({ row: 4, col: 4 }) // E5
    expect(cells).toHaveLength(5)
    expect(keys(cells).sort()).toEqual(keys([
      { row: 4, col: 4 },
      { row: 3, col: 4 },
      { row: 5, col: 4 },
      { row: 4, col: 3 },
      { row: 4, col: 5 }
    ]).sort())
  })

  it('clips at the top-left corner (A1)', () => {
    const cells = getBombTargets({ row: 0, col: 0 })
    expect(cells).toHaveLength(3)
    for (const c of cells) expect(isInsideBoard(c)).toBe(true)
    expect(keys(cells)).toContain(coordinateKey({ row: 0, col: 0 }))
  })

  it('clips along an edge to four cells', () => {
    const cells = getBombTargets({ row: 0, col: 5 }) // top edge
    expect(cells).toHaveLength(4)
    for (const c of cells) expect(isInsideBoard(c)).toBe(true)
  })

  it('clips at the bottom-right corner', () => {
    const cells = getBombTargets({ row: BOARD_SIZE - 1, col: BOARD_SIZE - 1 })
    expect(cells).toHaveLength(3)
    for (const c of cells) expect(isInsideBoard(c)).toBe(true)
  })

  it('never returns duplicates', () => {
    expect(allUnique(getBombTargets({ row: 4, col: 4 }))).toBe(true)
    expect(allUnique(getBombTargets({ row: 0, col: 0 }))).toBe(true)
  })
})

// ===========================================================================
// Nuke geometry
// ===========================================================================

describe('getNukeTargets', () => {
  it('returns 13 cells (Manhattan radius 2) in the centre', () => {
    const cells = getNukeTargets({ row: 4, col: 4 })
    expect(cells).toHaveLength(13)
    // Every cell is within Manhattan distance 2 of the centre.
    for (const c of cells) {
      expect(Math.abs(c.row - 4) + Math.abs(c.col - 4)).toBeLessThanOrEqual(2)
      expect(isInsideBoard(c)).toBe(true)
    }
  })

  it('clips at a corner', () => {
    const cells = getNukeTargets({ row: 0, col: 0 })
    // Only the quadrant inside the board survives.
    for (const c of cells) expect(isInsideBoard(c)).toBe(true)
    expect(cells.length).toBeLessThan(13)
    expect(keys(cells).sort()).toEqual(keys([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 0 }
    ]).sort())
  })

  it('clips along an edge', () => {
    const cells = getNukeTargets({ row: 0, col: 5 })
    for (const c of cells) expect(isInsideBoard(c)).toBe(true)
    expect(cells.length).toBeLessThan(13)
  })

  it('never returns duplicates or off-board cells', () => {
    for (const center of [{ row: 4, col: 4 }, { row: 0, col: 0 }, { row: 9, col: 9 }, { row: 0, col: 9 }]) {
      const cells = getNukeTargets(center)
      expect(allUnique(cells)).toBe(true)
      for (const c of cells) expect(isInsideBoard(c)).toBe(true)
    }
  })
})

// ===========================================================================
// Scatter Missile geometry
// ===========================================================================

describe('getScatterTargets', () => {
  it('always includes the selected cell plus five additional cells (6 unique total)', () => {
    const center = { row: 4, col: 4 }
    const cells = getScatterTargets(center, [])
    expect(cells).toHaveLength(6)
    expect(cells[0]).toEqual(center)
    expect(allUnique(cells)).toBe(true)
  })

  it('never selects the centre or a previously-shot cell as a random extra', () => {
    const center = { row: 4, col: 4 }
    const shot: Coordinate[] = [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 2 }
    ]
    // Deterministic-ish: run many times to exercise the randomness.
    for (let n = 0; n < 200; n++) {
      const cells = getScatterTargets(center, shot)
      const extras = cells.slice(1)
      const shotKeys = new Set(keys(shot))
      for (const e of extras) {
        expect(coordinateKey(e)).not.toBe(coordinateKey(center))
        expect(shotKeys.has(coordinateKey(e))).toBe(false)
        expect(isInsideBoard(e)).toBe(true)
      }
      expect(allUnique(cells)).toBe(true)
    }
  })

  it('attacks every remaining unshot cell when fewer than five remain', () => {
    // Mark all cells shot except the centre and two others => only 2 extras exist.
    const center = { row: 0, col: 0 }
    const unshotExtras = [
      { row: 0, col: 1 },
      { row: 0, col: 2 }
    ]
    const allowed = new Set([coordinateKey(center), ...keys(unshotExtras)])
    const shot: Coordinate[] = []
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!allowed.has(`${r},${c}`)) shot.push({ row: r, col: c })
      }
    }
    const cells = getScatterTargets(center, shot)
    expect(cells).toHaveLength(3) // centre + the 2 remaining
    expect(cells[0]).toEqual(center)
    expect(keys(cells.slice(1)).sort()).toEqual(keys(unshotExtras).sort())
  })

  it('uses the injected rng so results are reproducible for a fixed seed', () => {
    const seq = [0.1, 0.9, 0.5, 0.3, 0.7]
    let i = 0
    const rng = () => seq[i++ % seq.length]
    const a = getScatterTargets({ row: 4, col: 4 }, [], rng)
    i = 0
    const b = getScatterTargets({ row: 4, col: 4 }, [], rng)
    expect(keys(a)).toEqual(keys(b))
  })
})

// ===========================================================================
// Reward mapping
// ===========================================================================

describe('rewardForShipLost', () => {
  it('maps the nth own ship lost to the right reward', () => {
    expect(rewardForShipLost(1)).toBe('bombs')
    expect(rewardForShipLost(2)).toBe('scatterMissile')
    expect(rewardForShipLost(3)).toBe('scatterMissile')
    expect(rewardForShipLost(4)).toBe('nuke')
    expect(rewardForShipLost(5)).toBeNull()
    expect(rewardForShipLost(6)).toBeNull()
  })
})

// ===========================================================================
// Inventory rewards through real play (own ships being sunk)
// ===========================================================================

describe('ability inventory rewards', () => {
  it('grows the DEFENDER inventory as their own ships are sunk (2->3->scatter->nuke)', () => {
    // b has five 2-cell ships in separate rows; a sinks them one by one.
    const bShips = [
      makeShip('destroyer', 2, { row: 0, col: 0 }, 'horizontal'),
      makeShip('cruiser', 2, { row: 2, col: 0 }, 'horizontal'),
      makeShip('submarine', 2, { row: 4, col: 0 }, 'horizontal'),
      makeShip('battleship', 2, { row: 6, col: 0 }, 'horizontal'),
      makeShip('carrier', 2, { row: 8, col: 0 }, 'horizontal')
    ]
    // a needs a ship so the game does not end when only b loses ships.
    let state = makeState(
      makeBoard([makeShip('destroyer', 2, { row: 0, col: 9 }, 'vertical')]),
      makeBoard(bShips)
    )

    expect(state.boards.b.abilities).toEqual({ bombs: 2, scatterMissile: 0, nuke: 0 })

    const sink = (row: number) => {
      // Two hits sink a 2-cell ship; hits keep a's turn.
      let res = fireShot(state, 'a', { row, col: 0 })
      if (!res.ok) throw new Error('hit failed')
      state = res.state
      res = fireShot(state, 'a', { row, col: 1 })
      if (!res.ok) throw new Error('sink failed')
      state = res.state
    }

    sink(0)
    expect(state.boards.b.shipsDestroyedCount).toBe(1)
    expect(state.boards.b.abilities).toEqual({ bombs: 3, scatterMissile: 0, nuke: 0 })

    sink(2)
    expect(state.boards.b.abilities).toEqual({ bombs: 3, scatterMissile: 1, nuke: 0 })

    sink(4)
    expect(state.boards.b.abilities).toEqual({ bombs: 3, scatterMissile: 2, nuke: 0 })

    sink(6)
    expect(state.boards.b.abilities).toEqual({ bombs: 3, scatterMissile: 2, nuke: 1 })

    // 5th ship: no further reward.
    sink(8)
    expect(state.boards.b.shipsDestroyedCount).toBe(5)
    expect(state.boards.b.abilities).toEqual({ bombs: 3, scatterMissile: 2, nuke: 1 })
    expect(state.status).toBe('finished')
  })

  it('does not award anything for merely hitting or partially damaging a ship', () => {
    const bShips = [
      makeShip('cruiser', 3, { row: 0, col: 0 }, 'horizontal'),
      makeShip('destroyer', 2, { row: 5, col: 0 }, 'horizontal')
    ]
    let state = makeState(makeBoard([makeShip('destroyer', 2, { row: 9, col: 9 }, 'vertical')]), makeBoard(bShips))
    const res = fireShot(state, 'a', { row: 0, col: 0 }) // one hit on the cruiser
    if (!res.ok) throw new Error()
    state = res.state
    expect(state.boards.b.shipsDestroyedCount).toBe(0)
    expect(state.boards.b.abilities).toEqual({ bombs: 2, scatterMissile: 0, nuke: 0 })
  })

  it('awards exactly one reward when a ship is sunk, and never twice for the same ship', () => {
    const bShips = [
      makeShip('destroyer', 2, { row: 0, col: 0 }, 'horizontal'),
      makeShip('cruiser', 3, { row: 5, col: 0 }, 'horizontal')
    ]
    let state = makeState(makeBoard([makeShip('destroyer', 2, { row: 9, col: 9 }, 'vertical')]), makeBoard(bShips))
    let res = fireShot(state, 'a', { row: 0, col: 0 })
    if (!res.ok) throw new Error()
    state = res.state
    res = fireShot(state, 'a', { row: 0, col: 1 }) // sinks destroyer
    if (!res.ok) throw new Error()
    state = res.state
    expect(state.boards.b.shipsDestroyedCount).toBe(1)
    expect(state.boards.b.abilities.bombs).toBe(3)
    // Firing at the now-sunk destroyer's cells again is rejected (already shot),
    // so the reward can never be granted twice.
    const dup = fireShot(state, 'a', { row: 0, col: 0 })
    expect(dup.ok).toBe(false)
  })

  it('awards multiple rewards when one ability sinks multiple own ships', () => {
    // Two of b's destroyers sit inside a nuke diamond centred on (4,4); a third
    // ship elsewhere keeps the fleet alive so the game continues.
    const bShips = [
      makeShip('destroyer', 2, { row: 4, col: 3 }, 'horizontal'), // (4,3),(4,4)
      makeShip('cruiser', 2, { row: 3, col: 5 }, 'vertical'), // (3,5),(4,5)
      makeShip('submarine', 2, { row: 9, col: 0 }, 'horizontal') // untouched
    ]
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 0, col: 9 }, 'vertical')], { nuke: 1 }), makeBoard(bShips))

    const res = useAbility(state, 'a', 'nuke', { row: 4, col: 4 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // Both b ships in the blast are sunk => 2 rewards to b: 1st bomb, 2nd scatter.
    expect(res.state.boards.b.shipsDestroyedCount).toBe(2)
    expect(res.state.boards.b.abilities).toEqual({ bombs: 3, scatterMissile: 1, nuke: 0 })
    // The attacker gains nothing for destroying enemy ships.
    expect(res.state.boards.a.abilities).toEqual({ bombs: 2, scatterMissile: 0, nuke: 0 })
    expect(res.state.status).toBe('playing')
  })
})

// ===========================================================================
// Charge consumption
// ===========================================================================

describe('ability charge consumption', () => {
  const enemy = () => makeBoard([makeShip('destroyer', 2, { row: 9, col: 0 }, 'horizontal')])

  it('consumes exactly one bomb charge (3 -> 2)', () => {
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 0, col: 9 }, 'vertical')], { bombs: 3 }), enemy())
    const res = useAbility(state, 'a', 'bombs', { row: 0, col: 0 })
    if (!res.ok) throw new Error()
    expect(res.state.boards.a.abilities.bombs).toBe(2)
  })

  it('consumes exactly one scatter charge (2 -> 1)', () => {
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 0, col: 9 }, 'vertical')], { scatterMissile: 2 }), enemy())
    const res = useAbility(state, 'a', 'scatter_missile', { row: 0, col: 0 })
    if (!res.ok) throw new Error()
    expect(res.state.boards.a.abilities.scatterMissile).toBe(1)
  })

  it('consumes exactly one nuke charge (1 -> 0)', () => {
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 0, col: 9 }, 'vertical')], { nuke: 1 }), enemy())
    const res = useAbility(state, 'a', 'nuke', { row: 0, col: 0 })
    if (!res.ok) throw new Error()
    expect(res.state.boards.a.abilities.nuke).toBe(0)
  })

  it('does not consume a charge for an invalid ability action', () => {
    // No nuke charge available.
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 0, col: 9 }, 'vertical')], { nuke: 0 }), enemy())
    const res = useAbility(state, 'a', 'nuke', { row: 0, col: 0 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('INVALID_ACTION')

    // Already-shot centre also must not consume a charge.
    const s2 = makeState(makeBoard([makeShip('destroyer', 2, { row: 0, col: 9 }, 'vertical')], { bombs: 2 }), enemy())
    const first = useAbility(s2, 'a', 'bombs', { row: 5, col: 5 })
    if (!first.ok) throw new Error()
    // Back to a's turn for the retry.
    const retryState = { ...first.state, currentPlayerIndex: 0 }
    const dup = useAbility(retryState, 'a', 'bombs', { row: 5, col: 5 })
    expect(dup.ok).toBe(false)
    expect(first.state.boards.a.abilities.bombs).toBe(1) // only the first use spent a charge
  })
})

// ===========================================================================
// Turn behaviour
// ===========================================================================

describe('ability turn behaviour', () => {
  const enemyWithShip = () => makeBoard([makeShip('cruiser', 3, { row: 0, col: 0 }, 'horizontal')])

  it('a normal shot uses one turn (miss passes it on)', () => {
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 9, col: 9 }, 'vertical')]), enemyWithShip())
    const res = fireShot(state, 'a', { row: 5, col: 5 })
    if (!res.ok) throw new Error()
    expect(currentPlayerId(res.state)).toBe('b')
  })

  it('Bombs always ends the turn, even on a hit', () => {
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 9, col: 9 }, 'vertical')], { bombs: 2 }), enemyWithShip())
    const res = useAbility(state, 'a', 'bombs', { row: 0, col: 0 }) // hits the cruiser
    if (!res.ok) throw new Error()
    expect(res.state.lastAbility?.hits).toBeGreaterThan(0)
    expect(currentPlayerId(res.state)).toBe('b')
  })

  it('Scatter Missile ends the turn', () => {
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 9, col: 9 }, 'vertical')], { scatterMissile: 1 }), enemyWithShip())
    const res = useAbility(state, 'a', 'scatter_missile', { row: 5, col: 5 })
    if (!res.ok) throw new Error()
    expect(currentPlayerId(res.state)).toBe('b')
  })

  it('Nuke ends the turn', () => {
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 9, col: 9 }, 'vertical')], { nuke: 1 }), enemyWithShip())
    const res = useAbility(state, 'a', 'nuke', { row: 5, col: 5 })
    if (!res.ok) throw new Error()
    expect(currentPlayerId(res.state)).toBe('b')
  })

  it('abilities cannot be used out of turn', () => {
    const state = makeState(makeBoard([makeShip('destroyer', 2, { row: 9, col: 9 }, 'vertical')], { bombs: 2 }), enemyWithShip())
    const res = useAbility(state, 'b', 'bombs', { row: 0, col: 0 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('NOT_YOUR_TURN')
  })
})

// ===========================================================================
// Security: the client cannot dictate ability cells
// ===========================================================================

describe('ability action validation (server authority)', () => {
  it('accepts only ability + target, ignoring any client-supplied cell list', () => {
    const action = battleshipsEngine.validateAction({
      type: 'use_ability',
      ability: 'scatter_missile',
      target: { row: 3, col: 3 },
      // A malicious client trying to pick its own cells:
      targets: [
        { row: 0, col: 0 },
        { row: 1, col: 1 }
      ]
    })
    expect(action).toEqual({ type: 'use_ability', ability: 'scatter_missile', target: { row: 3, col: 3 } })
    expect(action as object).not.toHaveProperty('targets')
  })

  it('rejects an unknown ability id', () => {
    expect(
      battleshipsEngine.validateAction({ type: 'use_ability', ability: 'laser', target: { row: 0, col: 0 } })
    ).toBeNull()
  })

  it('rejects an off-board target', () => {
    expect(
      battleshipsEngine.validateAction({ type: 'use_ability', ability: 'bombs', target: { row: 10, col: 0 } })
    ).toBeNull()
  })

  it('generates the scatter cells on the server regardless of client input', () => {
    // The engine only ever receives {ability, target}; the 6 struck cells are
    // computed inside useAbility, so the client cannot supply them.
    const state = makeState(
      makeBoard([makeShip('destroyer', 2, { row: 0, col: 9 }, 'vertical')], { scatterMissile: 1 }),
      makeBoard([makeShip('cruiser', 3, { row: 5, col: 5 }, 'horizontal')])
    )
    const res = useAbility(state, 'a', 'scatter_missile', { row: 0, col: 0 })
    if (!res.ok) throw new Error()
    const struck = res.state.boards.b.shots
    expect(struck.length).toBe(6) // centre + 5 server-chosen cells
    expect(struck[0].coordinate).toEqual({ row: 0, col: 0 })
    expect(allUnique(struck.map((s) => s.coordinate))).toBe(true)
  })
})
