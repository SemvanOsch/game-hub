import { describe, expect, it } from 'vitest'
import { fireShot, type BattleshipsGameState } from './engine'
import { getPlayerView } from './view'
import { coordinateKey, type Coordinate, type Orientation, type Ship, type ShipType } from './types'

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

function baseState(): BattleshipsGameState {
  return {
    status: 'playing',
    playerOrder: ['a', 'b'],
    currentPlayerIndex: 0,
    boards: {
      // a: destroyer at A1-B1 (row 0, cols 0-1)
      a: { ships: [makeShip('destroyer', 2, { row: 0, col: 0 }, 'horizontal')], shots: [] },
      // b: destroyer at J9-J10 (row 8-9, col 9)
      b: { ships: [makeShip('destroyer', 2, { row: 8, col: 9 }, 'vertical')], shots: [] }
    }
  }
}

/** Collect every ship-position coordinate key present anywhere in a value. */
function allCoordKeysInJson(value: unknown, ships: Ship[]): Set<string> {
  const json = JSON.stringify(value)
  const found = new Set<string>()
  for (const ship of ships) {
    for (const pos of ship.positions) {
      // A leaked position would serialize its row/col numbers together.
      const needle = `"row":${pos.row},"col":${pos.col}`
      if (json.includes(needle)) found.add(coordinateKey(pos))
    }
  }
  return found
}

describe('getPlayerView – information security', () => {
  it('gives each player their OWN complete fleet with positions', () => {
    const state = baseState()
    const viewA = getPlayerView(state, 'a')
    const viewB = getPlayerView(state, 'b')

    expect(viewA.own.ships).toHaveLength(1)
    expect(viewA.own.ships[0].positions).toHaveLength(2)
    expect(viewB.own.ships[0].positions).toHaveLength(2)
  })

  it('never sends unsunk opponent ship positions to a player', () => {
    const state = baseState()
    const viewA = getPlayerView(state, 'a')
    const viewB = getPlayerView(state, 'b')

    // A must not learn B's ship positions...
    const bLeakInA = allCoordKeysInJson(viewA.enemy, state.boards.b.ships)
    expect(bLeakInA.size).toBe(0)
    expect(viewA.enemy.revealedShips).toHaveLength(0)

    // ...and B must not learn A's ship positions.
    const aLeakInB = allCoordKeysInJson(viewB.enemy, state.boards.a.ships)
    expect(aLeakInB.size).toBe(0)
    expect(viewB.enemy.revealedShips).toHaveLength(0)
  })

  it('does not leak enemy positions anywhere in the whole serialized view', () => {
    const state = baseState()
    const viewA = getPlayerView(state, 'a')
    // Scan the ENTIRE view (not just enemy) for B's coordinates.
    const leak = allCoordKeysInJson(viewA, state.boards.b.ships)
    expect(leak.size).toBe(0)
  })

  it('shares hit/miss information for shots that have been fired', () => {
    let state = baseState()
    // a misses at (5,5)
    let res = fireShot(state, 'a', { row: 5, col: 5 })
    if (!res.ok) throw new Error('expected miss to succeed')
    state = res.state
    // b fires somewhere
    res = fireShot(state, 'b', { row: 1, col: 1 })
    if (!res.ok) throw new Error('expected b shot to succeed')
    state = res.state

    const viewA = getPlayerView(state, 'a')
    expect(viewA.enemy.shots).toHaveLength(1)
    expect(viewA.enemy.shots[0]).toMatchObject({
      coordinate: { row: 5, col: 5 },
      result: 'miss'
    })

    const viewB = getPlayerView(state, 'b')
    // a's shot on b appears as an incoming shot on a's OWN board (from b's view of a? no)
    // b sees the shot they fired at a as an enemy shot:
    expect(viewB.enemy.shots).toHaveLength(1)
    expect(viewB.enemy.shots[0].coordinate).toEqual({ row: 1, col: 1 })
  })

  it('reveals an enemy ship only once it is sunk', () => {
    let state = baseState()
    // a hits b's destroyer at (8,9); a keeps the turn on a hit.
    let res = fireShot(state, 'a', { row: 8, col: 9 })
    if (!res.ok) throw new Error()
    state = res.state
    // Before the final hit, nothing about the destroyer is revealed.
    let viewA = getPlayerView(state, 'a')
    expect(viewA.enemy.revealedShips).toHaveLength(0)

    res = fireShot(state, 'a', { row: 9, col: 9 })
    if (!res.ok) throw new Error()
    state = res.state

    viewA = getPlayerView(state, 'a')
    // Game is now over (b's only ship sunk) -> both fleets revealed.
    expect(state.status).toBe('finished')
    const revealedTypes = viewA.enemy.revealedShips.map((s) => s.type)
    expect(revealedTypes).toContain('destroyer')
    expect(viewA.enemyFleet.find((s) => s.type === 'destroyer')?.sunk).toBe(true)
  })

  it('enemy fleet status exposes only sunk state, never hit counts, for unsunk ships', () => {
    let state = baseState()
    // a hits one cell of b's destroyer but does not sink it.
    const res = fireShot(state, 'a', { row: 8, col: 9 })
    if (!res.ok) throw new Error()
    state = res.state

    const viewA = getPlayerView(state, 'a')
    const enemyDestroyer = viewA.enemyFleet.find((s) => s.type === 'destroyer')
    expect(enemyDestroyer?.sunk).toBe(false)
    // The enemy fleet summary carries no hit array to infer damage from.
    expect(enemyDestroyer as object).not.toHaveProperty('hits')
    // And the ship itself is still not revealed.
    expect(viewA.enemy.revealedShips).toHaveLength(0)
  })
})
