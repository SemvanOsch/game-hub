import { describe, expect, it } from 'vitest'
import {
  createGame,
  currentPlayerId,
  fireShot,
  generateRandomFleet,
  isFleetSunk,
  isShipSunk,
  removePlayerFromGame,
  type BattleshipsGameState
} from './engine'
import {
  BOARD_SIZE,
  SHIP_DEFINITIONS,
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

function makeState(shipsA: Ship[], shipsB: Ship[], currentPlayerIndex = 0): BattleshipsGameState {
  return {
    status: 'playing',
    playerOrder: ['a', 'b'],
    currentPlayerIndex,
    boards: {
      a: { ships: shipsA, shots: [] },
      b: { ships: shipsB, shots: [] }
    }
  }
}

// --- fleet generation ------------------------------------------------------

describe('generateRandomFleet', () => {
  it('produces valid fleets across many generations', () => {
    const expectedLengths = new Map<ShipType, number>(
      SHIP_DEFINITIONS.map((d) => [d.type, d.length])
    )

    for (let n = 0; n < 500; n++) {
      const fleet = generateRandomFleet()

      // Exactly five ships, one of each type, correct lengths.
      expect(fleet).toHaveLength(SHIP_DEFINITIONS.length)
      const types = fleet.map((s) => s.type).sort()
      expect(types).toEqual(SHIP_DEFINITIONS.map((d) => d.type).sort())
      for (const ship of fleet) {
        expect(ship.length).toBe(expectedLengths.get(ship.type))
        expect(ship.positions).toHaveLength(ship.length)
        expect(ship.hits).toHaveLength(ship.length)
        expect(ship.sunk).toBe(false)
      }

      // Every cell inside the board, and no two ships overlap.
      const occupied = new Set<string>()
      for (const ship of fleet) {
        for (const cell of ship.positions) {
          expect(isInsideBoard(cell)).toBe(true)
          const key = coordinateKey(cell)
          expect(occupied.has(key)).toBe(false)
          occupied.add(key)
        }
      }

      // Total occupied cells equals the sum of ship lengths (no overlaps).
      const totalLength = SHIP_DEFINITIONS.reduce((sum, d) => sum + d.length, 0)
      expect(occupied.size).toBe(totalLength)
    }
  })

  it('keeps every ship straight (single row or single column)', () => {
    for (let n = 0; n < 100; n++) {
      for (const ship of generateRandomFleet()) {
        const sameRow = ship.positions.every((p) => p.row === ship.positions[0].row)
        const sameCol = ship.positions.every((p) => p.col === ship.positions[0].col)
        expect(sameRow || sameCol).toBe(true)
      }
    }
  })
})

// --- createGame ------------------------------------------------------------

describe('createGame', () => {
  it('gives both players an identical fleet composition with independent layouts', () => {
    const game = createGame(['a', 'b'])
    expect(game.status).toBe('playing')
    expect(Object.keys(game.boards).sort()).toEqual(['a', 'b'])
    expect([0, 1]).toContain(game.currentPlayerIndex)

    const compA = game.boards.a.ships.map((s) => s.type).sort()
    const compB = game.boards.b.ships.map((s) => s.type).sort()
    expect(compA).toEqual(compB)
  })
})

// --- shot logic ------------------------------------------------------------

describe('fireShot', () => {
  it('registers a miss and passes the turn', () => {
    // b has a single destroyer at A1-A2 (col 0, rows 0-1).
    const state = makeState([], [makeShip('destroyer', 2, { row: 0, col: 0 }, 'vertical')])
    const res = fireShot(state, 'a', { row: 9, col: 9 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.state.boards.b.shots).toHaveLength(1)
    expect(res.state.boards.b.shots[0].result).toBe('miss')
    // Turn switched to b; a hit/miss both end the turn.
    expect(currentPlayerId(res.state)).toBe('b')
    expect(res.state.lastShot?.result).toBe('miss')
  })

  it('registers a hit and keeps the same player firing', () => {
    const state = makeState([], [makeShip('destroyer', 2, { row: 0, col: 0 }, 'vertical')])
    const res = fireShot(state, 'a', { row: 0, col: 0 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.state.boards.b.shots[0].result).toBe('hit')
    expect(res.state.boards.b.ships[0].hits[0]).toBe(true)
    expect(res.state.boards.b.ships[0].sunk).toBe(false)
    // A hit lets the player keep firing.
    expect(currentPlayerId(res.state)).toBe('a')
  })

  it('rejects firing when it is not your turn', () => {
    const state = makeState([], [makeShip('destroyer', 2, { row: 0, col: 0 }, 'vertical')])
    const res = fireShot(state, 'b', { row: 0, col: 0 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('NOT_YOUR_TURN')
  })

  it('rejects duplicate shots at the same coordinate', () => {
    let state = makeState([], [makeShip('destroyer', 2, { row: 0, col: 0 }, 'vertical')])
    const first = fireShot(state, 'a', { row: 5, col: 5 })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state // now b's turn
    const bTurn = fireShot(state, 'b', { row: 8, col: 8 })
    expect(bTurn.ok).toBe(true)
    if (!bTurn.ok) return
    state = bTurn.state // back to a
    const dup = fireShot(state, 'a', { row: 5, col: 5 })
    expect(dup.ok).toBe(false)
    if (dup.ok) return
    expect(dup.code).toBe('INVALID_ACTION')
  })

  it('rejects out-of-bounds coordinates', () => {
    const state = makeState([], [makeShip('destroyer', 2, { row: 0, col: 0 }, 'vertical')])
    const res = fireShot(state, 'a', { row: BOARD_SIZE, col: 0 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('INVALID_ACTION')
  })

  it('sinks a ship once all its cells are hit', () => {
    // Give a a ship too so the game does not end when b's destroyer sinks.
    const aShips = [makeShip('carrier', 5, { row: 0, col: 0 }, 'horizontal')]
    const bShips = [
      makeShip('destroyer', 2, { row: 0, col: 0 }, 'vertical'),
      makeShip('cruiser', 3, { row: 5, col: 5 }, 'horizontal')
    ]
    let state = makeState(aShips, bShips)

    // a hits (0,0) -> keeps firing on a hit
    let res = fireShot(state, 'a', { row: 0, col: 0 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    state = res.state
    expect(currentPlayerId(state)).toBe('a')
    // a hits (1,0) -> destroyer sunk
    res = fireShot(state, 'a', { row: 1, col: 0 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    state = res.state

    const destroyer = state.boards.b.ships.find((s) => s.type === 'destroyer') as Ship
    expect(isShipSunk(destroyer)).toBe(true)
    expect(destroyer.sunk).toBe(true)
    expect(state.lastShot?.sunkShipType).toBe('destroyer')
    // Fleet not fully sunk yet (cruiser remains), game continues.
    expect(state.status).toBe('playing')
  })

  it('ends the game when the entire enemy fleet is sunk', () => {
    const bShips = [makeShip('destroyer', 2, { row: 0, col: 0 }, 'horizontal')]
    let state = makeState([makeShip('cruiser', 3, { row: 0, col: 0 }, 'horizontal')], bShips)

    // Two consecutive hits (turn stays with a) sink b's only ship.
    let res = fireShot(state, 'a', { row: 0, col: 0 })
    if (!res.ok) return
    state = res.state
    res = fireShot(state, 'a', { row: 0, col: 1 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    state = res.state

    expect(isFleetSunk(state.boards.b.ships)).toBe(true)
    expect(state.status).toBe('finished')
    expect(state.winnerId).toBe('a')
  })

  it('passes the turn only after a miss', () => {
    const bShips = [makeShip('destroyer', 2, { row: 0, col: 0 }, 'vertical')]
    let state = makeState([makeShip('destroyer', 2, { row: 9, col: 8 }, 'horizontal')], bShips)
    // a hits (0,0) -> still a's turn
    let res = fireShot(state, 'a', { row: 0, col: 0 })
    if (!res.ok) return
    state = res.state
    expect(currentPlayerId(state)).toBe('a')
    // a misses (5,5) -> turn passes to b
    res = fireShot(state, 'a', { row: 5, col: 5 })
    if (!res.ok) return
    state = res.state
    expect(currentPlayerId(state)).toBe('b')
  })
})

// --- disconnect handling ---------------------------------------------------

describe('removePlayerFromGame', () => {
  it('awards the win to the remaining player mid-match', () => {
    const state = makeState(
      [makeShip('destroyer', 2, { row: 0, col: 0 }, 'horizontal')],
      [makeShip('destroyer', 2, { row: 0, col: 0 }, 'horizontal')]
    )
    const next = removePlayerFromGame(state, 'b')
    expect(next).not.toBeNull()
    expect(next?.status).toBe('finished')
    expect(next?.winnerId).toBe('a')
  })

  it('returns null when the last player leaves', () => {
    const state = makeState([], [])
    const afterFirst = removePlayerFromGame(state, 'a')
    expect(afterFirst).not.toBeNull()
    const afterSecond = removePlayerFromGame(afterFirst as BattleshipsGameState, 'b')
    expect(afterSecond).toBeNull()
  })
})
