import { describe, it, expect } from 'vitest'
import type { UnoCard, UnoColor } from './cards'
import {
  callUno,
  catchUno,
  chooseColor,
  createGame,
  drawCard,
  pass,
  playCard,
  playableCardIds,
  removePlayerFromGame,
  topCard,
  type UnoGameState,
  type UnoServerPlayer
} from './engine'

// --- Fixtures --------------------------------------------------------------

const num = (id: string, color: UnoColor, value: number): UnoCard => ({
  id,
  color,
  type: 'number',
  value
})
const action = (id: string, color: UnoColor, type: UnoCard['type']): UnoCard => ({
  id,
  color,
  type,
  value: null
})
const wild = (id: string, type: 'wild' | 'wild_draw_four'): UnoCard => ({
  id,
  color: null,
  type,
  value: null
})

function player(id: string, hand: UnoCard[]): UnoServerPlayer {
  return { playerId: id, hand, saidUno: false, unoPenaltyPending: false }
}

/**
 * Build a fully-controlled state. `top` is the current discard; `activeColor`
 * defaults to the top card's colour.
 */
function makeState(opts: {
  order: string[]
  hands: Record<string, UnoCard[]>
  top: UnoCard
  activeColor?: UnoColor
  drawPile?: UnoCard[]
  direction?: 1 | -1
  current?: string
  stacking?: boolean
}): UnoGameState {
  const players: Record<string, UnoServerPlayer> = {}
  for (const id of opts.order) players[id] = player(id, opts.hands[id] ?? [])
  return {
    status: 'playing',
    stacking: opts.stacking ?? false,
    pendingDraw: 0,
    pendingDrawType: null,
    playerOrder: [...opts.order],
    players,
    drawPile: opts.drawPile ?? [num('d1', 'red', 0), num('d2', 'blue', 0)],
    discardPile: [opts.top],
    activeColor: opts.activeColor ?? (opts.top.color as UnoColor),
    direction: opts.direction ?? 1,
    currentPlayerId: opts.current ?? opts.order[0]
  }
}

function expectOk(r: ReturnType<typeof playCard>): UnoGameState {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`)
  return r.state
}

// --- createGame ------------------------------------------------------------

describe('createGame', () => {
  it('deals 7 cards to every player', () => {
    const s = createGame(['a', 'b', 'c'])
    for (const id of ['a', 'b', 'c']) expect(s.players[id].hand).toHaveLength(7)
  })

  it('opens on a number card with a matching active colour', () => {
    for (let i = 0; i < 50; i++) {
      const s = createGame(['a', 'b'])
      expect(topCard(s).type).toBe('number')
      expect(s.activeColor).toBe(topCard(s).color)
    }
  })

  it('conserves all 108 cards across hands, draw pile and discard', () => {
    const s = createGame(['a', 'b', 'c', 'd'])
    const total =
      s.drawPile.length +
      s.discardPile.length +
      Object.values(s.players).reduce((n, p) => n + p.hand.length, 0)
    expect(total).toBe(108)
  })

  it('starts with the first player and forward direction', () => {
    const s = createGame(['a', 'b'])
    expect(s.currentPlayerId).toBe('a')
    expect(s.direction).toBe(1)
    expect(s.status).toBe('playing')
  })
})

// --- Basic play & legality -------------------------------------------------

describe('playCard legality', () => {
  it('accepts a colour match and advances the turn', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'red', 5)], b: [num('b1', 'blue', 1)] },
      top: num('t', 'red', 9)
    })
    // playing the only card would win; give a a second card
    s.players.a.hand.push(num('a2', 'green', 4))
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(topCard(next).id).toBe('a1')
    expect(next.activeColor).toBe('red')
    expect(next.currentPlayerId).toBe('b')
  })

  it('accepts a value match across colours', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'blue', 9), num('a2', 'green', 1)] },
      top: num('t', 'red', 9)
    })
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(topCard(next).id).toBe('a1')
    expect(next.activeColor).toBe('blue')
  })

  it('rejects an illegal card', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'blue', 3), num('a2', 'green', 1)] },
      top: num('t', 'red', 9)
    })
    const r = playCard(s, 'a', 'a1', undefined, false)
    expect(r.ok).toBe(false)
  })

  it('rejects a card not in hand', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'red', 3)] },
      top: num('t', 'red', 9)
    })
    const r = playCard(s, 'a', 'ghost', undefined, false)
    expect(r.ok).toBe(false)
  })

  it("rejects a play when it is not the player's turn", () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'red', 3)], b: [num('b1', 'red', 4)] },
      top: num('t', 'red', 9)
    })
    const r = playCard(s, 'b', 'b1', undefined, false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('NOT_YOUR_TURN')
  })
})

// --- Action cards ----------------------------------------------------------

describe('action cards', () => {
  it('Skip jumps the next player', () => {
    const s = makeState({
      order: ['a', 'b', 'c'],
      hands: { a: [action('a1', 'red', 'skip'), num('a2', 'red', 2)] },
      top: num('t', 'red', 9)
    })
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.currentPlayerId).toBe('c') // b is skipped
  })

  it('Reverse flips direction (3+ players)', () => {
    const s = makeState({
      order: ['a', 'b', 'c'],
      hands: { a: [action('a1', 'red', 'reverse'), num('a2', 'red', 2)] },
      top: num('t', 'red', 9)
    })
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.direction).toBe(-1)
    expect(next.currentPlayerId).toBe('c') // one step backward from a
  })

  it('Reverse acts as Skip with two players', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [action('a1', 'red', 'reverse'), num('a2', 'red', 2)] },
      top: num('t', 'red', 9)
    })
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.currentPlayerId).toBe('a') // returns to the mover
  })

  it('Draw Two makes the next player draw 2 and skips them', () => {
    const s = makeState({
      order: ['a', 'b', 'c'],
      hands: {
        a: [action('a1', 'red', 'draw_two'), num('a2', 'red', 2)],
        b: [num('b1', 'green', 1)]
      },
      top: num('t', 'red', 9),
      drawPile: [num('p1', 'blue', 1), num('p2', 'blue', 2), num('p3', 'blue', 3)]
    })
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.players.b.hand).toHaveLength(3) // 1 + 2 penalty
    expect(next.currentPlayerId).toBe('c') // b skipped
  })
})

// --- Stacking (house rule) -------------------------------------------------

describe('Draw Two / Wild Draw Four stacking', () => {
  it('with stacking off, a Draw Two applies the penalty immediately', () => {
    const s = makeState({
      order: ['a', 'b', 'c'],
      hands: {
        a: [action('a1', 'red', 'draw_two'), num('a2', 'red', 2)],
        b: [num('b1', 'green', 1)]
      },
      top: num('t', 'red', 9),
      drawPile: [num('p1', 'blue', 1), num('p2', 'blue', 2)],
      stacking: false
    })
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.players.b.hand).toHaveLength(3)
    expect(next.pendingDraw).toBe(0)
    expect(next.currentPlayerId).toBe('c')
  })

  it('with stacking on, a Draw Two passes an accumulating penalty to the next player', () => {
    const s = makeState({
      order: ['a', 'b', 'c'],
      hands: {
        a: [action('a1', 'red', 'draw_two'), num('a2', 'red', 2)],
        b: [action('b1', 'green', 'draw_two'), num('b2', 'green', 1)],
        c: [num('c1', 'blue', 1)]
      },
      top: num('t', 'red', 9),
      drawPile: [num('p1', 'blue', 1), num('p2', 'blue', 2), num('p3', 'blue', 5), num('p4', 'blue', 6)],
      stacking: true
    })
    // a plays Draw Two: penalty 2, turn to b (not skipped).
    let next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.pendingDraw).toBe(2)
    expect(next.pendingDrawType).toBe('draw_two')
    expect(next.currentPlayerId).toBe('b')
    // while a stack is pending, b may only play a Draw Two.
    expect(playableCardIds(next, 'b')).toEqual(['b1'])
    // b stacks: penalty 4, turn to c.
    next = expectOk(playCard(next, 'b', 'b1', undefined, false))
    expect(next.pendingDraw).toBe(4)
    expect(next.currentPlayerId).toBe('c')
    // c cannot stack -> draws the whole penalty and is skipped.
    next = expectOk(drawCard(next, 'c'))
    expect(next.players.c.hand).toHaveLength(5) // 1 + 4
    expect(next.pendingDraw).toBe(0)
    expect(next.currentPlayerId).toBe('a')
  })

  it('a non-draw card cannot answer a pending stack', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: {
        a: [action('a1', 'red', 'draw_two'), num('a3', 'red', 2)],
        b: [num('b1', 'red', 9), action('b2', 'blue', 'draw_two')]
      },
      top: num('t', 'red', 9),
      stacking: true
    })
    const stacked = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(playCard(stacked, 'b', 'b1', undefined, false).ok).toBe(false) // number card
    expect(playCard(stacked, 'b', 'b2', undefined, false).ok).toBe(true) // draw two
  })

  it('Wild Draw Four stacks only onto Wild Draw Four', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: {
        a: [wild('a1', 'wild_draw_four'), num('a2', 'green', 2)],
        b: [action('b1', 'red', 'draw_two'), wild('b2', 'wild_draw_four'), num('b3', 'green', 1)]
      },
      top: num('t', 'red', 9), // a has no red -> WD4 legal
      drawPile: [num('p1', 'blue', 1), num('p2', 'blue', 2), num('p3', 'blue', 3), num('p4', 'blue', 4)],
      stacking: true
    })
    const stacked = expectOk(playCard(s, 'a', 'a1', 'green', false))
    expect(stacked.pendingDraw).toBe(4)
    expect(stacked.pendingDrawType).toBe('wild_draw_four')
    // b may answer only with the WD4, not the Draw Two.
    expect(playableCardIds(stacked, 'b').sort()).toEqual(['b2'])
  })
})

// --- Wilds -----------------------------------------------------------------

describe('wild cards', () => {
  it('a bare wild enters choosing_color and holds the turn', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [wild('a1', 'wild'), num('a2', 'red', 2)] },
      top: num('t', 'red', 9)
    })
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.status).toBe('choosing_color')
    expect(next.pendingColorPlayerId).toBe('a')
    expect(next.currentPlayerId).toBe('a') // turn not advanced yet
  })

  it('choose_color sets the active colour and advances', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [wild('a1', 'wild'), num('a2', 'red', 2)] },
      top: num('t', 'red', 9)
    })
    const played = expectOk(playCard(s, 'a', 'a1', undefined, false))
    const next = expectOk(chooseColor(played, 'a', 'green'))
    expect(next.status).toBe('playing')
    expect(next.activeColor).toBe('green')
    expect(next.currentPlayerId).toBe('b')
  })

  it('a bundled colour applies atomically', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [wild('a1', 'wild'), num('a2', 'red', 2)] },
      top: num('t', 'red', 9)
    })
    const next = expectOk(playCard(s, 'a', 'a1', 'blue', false))
    expect(next.status).toBe('playing')
    expect(next.activeColor).toBe('blue')
    expect(next.currentPlayerId).toBe('b')
  })

  it('rejects a colour choice from the wrong player / when not choosing', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [wild('a1', 'wild'), num('a2', 'red', 2)] },
      top: num('t', 'red', 9)
    })
    const played = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(chooseColor(played, 'b', 'green').ok).toBe(false) // wrong player
    const done = expectOk(chooseColor(played, 'a', 'green'))
    expect(chooseColor(done, 'a', 'red').ok).toBe(false) // duplicate / not choosing
  })

  it('rejects an invalid colour value', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [wild('a1', 'wild'), num('a2', 'red', 2)] },
      top: num('t', 'red', 9)
    })
    const played = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(chooseColor(played, 'a', 'purple' as UnoColor).ok).toBe(false)
  })

  it('Wild Draw Four is illegal when a matching colour is held', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [wild('a1', 'wild_draw_four'), num('a2', 'red', 2)] },
      top: num('t', 'red', 9) // active colour red; a holds a red 2
    })
    const r = playCard(s, 'a', 'a1', 'blue', false)
    expect(r.ok).toBe(false)
  })

  it('Wild Draw Four is legal with no matching colour, drawing 4 and skipping', () => {
    const s = makeState({
      order: ['a', 'b', 'c'],
      hands: {
        a: [wild('a1', 'wild_draw_four'), num('a2', 'green', 2)],
        b: [num('b1', 'green', 1)]
      },
      top: num('t', 'red', 9), // active red; a has no red
      drawPile: [
        num('p1', 'blue', 1),
        num('p2', 'blue', 2),
        num('p3', 'blue', 3),
        num('p4', 'blue', 4)
      ]
    })
    const next = expectOk(playCard(s, 'a', 'a1', 'yellow', false))
    expect(next.activeColor).toBe('yellow')
    expect(next.players.b.hand).toHaveLength(5) // 1 + 4 penalty
    expect(next.currentPlayerId).toBe('c') // b skipped
  })
})

// --- Drawing ---------------------------------------------------------------

describe('drawing', () => {
  it('drawing a non-playable card ends the turn', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'green', 3)], b: [] },
      top: num('t', 'red', 9),
      drawPile: [num('p1', 'blue', 4)] // not playable on red 9
    })
    const next = expectOk(drawCard(s, 'a'))
    expect(next.players.a.hand).toHaveLength(2)
    expect(next.currentPlayerId).toBe('b')
  })

  it('drawing a playable card holds the turn for play-or-pass', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'green', 3)], b: [] },
      top: num('t', 'red', 9),
      drawPile: [num('p1', 'red', 4)] // playable
    })
    const next = expectOk(drawCard(s, 'a'))
    expect(next.currentPlayerId).toBe('a')
    expect(next.drawnCardId).toBe('p1')
    // may pass to end the turn
    const passed = expectOk(pass(next, 'a'))
    expect(passed.currentPlayerId).toBe('b')
  })

  it('after drawing, only the drawn card may be played', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'red', 3), num('ax', 'red', 1)], b: [] },
      top: num('t', 'red', 9),
      drawPile: [num('p1', 'red', 4)]
    })
    const drawn = expectOk(drawCard(s, 'a'))
    expect(playCard(drawn, 'a', 'a1', undefined, false).ok).toBe(false) // held card
    expect(playCard(drawn, 'a', 'p1', undefined, false).ok).toBe(true) // drawn card
  })

  it('recycles the discard pile when the draw pile is empty', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'green', 3)], b: [] },
      top: num('t', 'red', 9),
      drawPile: []
    })
    // seed some buried discards to be recycled
    s.discardPile = [num('old1', 'blue', 1), num('old2', 'blue', 2), num('t', 'red', 9)]
    const next = expectOk(drawCard(s, 'a'))
    // top preserved, buried cards recycled into the draw pile
    expect(topCard(next).id).toBe('t')
    expect(next.players.a.hand.length + next.drawPile.length).toBe(3)
  })
})

// --- UNO -------------------------------------------------------------------

describe('UNO call & penalty', () => {
  function twoCardState() {
    return makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'red', 3), num('a2', 'green', 8)], b: [num('b1', 'blue', 1)] },
      top: num('t', 'red', 9)
    })
  }

  it('declaring UNO with the play marks the player safe', () => {
    const s = twoCardState()
    const next = expectOk(playCard(s, 'a', 'a1', undefined, true))
    expect(next.players.a.hand).toHaveLength(1)
    expect(next.players.a.saidUno).toBe(true)
    expect(next.players.a.unoPenaltyPending).toBe(false)
  })

  it('dropping to one card without declaring leaves the player catchable', () => {
    const s = twoCardState()
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.players.a.unoPenaltyPending).toBe(true)
    // b catches a -> a draws 2
    const caught = catchUno(next, 'b', 'a')
    expect(caught.ok).toBe(true)
    if (caught.ok) {
      expect(caught.state.players.a.hand).toHaveLength(3)
      expect(caught.state.players.a.unoPenaltyPending).toBe(false)
    }
  })

  it('a self-call before being caught closes the window', () => {
    const s = twoCardState()
    const dropped = expectOk(playCard(s, 'a', 'a1', undefined, false))
    const safe = expectOk(callUno(dropped, 'a'))
    expect(safe.players.a.saidUno).toBe(true)
    expect(catchUno(safe, 'b', 'a').ok).toBe(false) // no longer catchable
  })

  it('rejects catching a player who is not catchable (fake catch)', () => {
    const s = twoCardState()
    expect(catchUno(s, 'b', 'a').ok).toBe(false) // a still has 2 cards
  })

  it('rejects a fake UNO call with more than one card', () => {
    const s = twoCardState()
    expect(callUno(s, 'a').ok).toBe(false)
  })

  it("the catch window closes once the exposed player's next turn begins", () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'red', 3), num('a2', 'green', 8)], b: [num('b1', 'blue', 1)] },
      top: num('t', 'red', 9),
      drawPile: [num('p1', 'yellow', 5)]
    })
    const dropped = expectOk(playCard(s, 'a', 'a1', undefined, false)) // a -> 1 card, b's turn
    // b plays nothing catchable; b draws (not playable) so turn returns to a
    const bDrew = expectOk(drawCard(dropped, 'b'))
    expect(bDrew.currentPlayerId).toBe('a')
    expect(bDrew.players.a.unoPenaltyPending).toBe(false) // got away with it
  })
})

// --- Win condition ---------------------------------------------------------

describe('win condition', () => {
  it('emptying the hand wins immediately and rejects further actions', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'red', 3)], b: [num('b1', 'blue', 1)] },
      top: num('t', 'red', 9)
    })
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.status).toBe('finished')
    expect(next.winnerId).toBe('a')
    // further play/draw rejected
    expect(playCard(next, 'b', 'b1', undefined, false).ok).toBe(false)
    expect(drawCard(next, 'b').ok).toBe(false)
  })

  it('winning on an action card ends the game without applying its effect', () => {
    const s = makeState({
      order: ['a', 'b', 'c'],
      hands: { a: [action('a1', 'red', 'draw_two')], b: [num('b1', 'blue', 1)] },
      top: num('t', 'red', 9)
    })
    const next = expectOk(playCard(s, 'a', 'a1', undefined, false))
    expect(next.status).toBe('finished')
    expect(next.winnerId).toBe('a')
    expect(next.players.b.hand).toHaveLength(1) // no penalty applied
  })
})

// --- Disconnect ------------------------------------------------------------

describe('removePlayerFromGame', () => {
  it('advances the turn when the current player leaves', () => {
    const s = makeState({
      order: ['a', 'b', 'c'],
      hands: { a: [num('a1', 'red', 3)], b: [num('b1', 'blue', 1)], c: [num('c1', 'green', 2)] },
      top: num('t', 'red', 9),
      current: 'a'
    })
    const next = removePlayerFromGame(s, 'a')
    expect(next).not.toBeNull()
    expect(next!.playerOrder).toEqual(['b', 'c'])
    expect(next!.currentPlayerId).toBe('b')
  })

  it('declares the last remaining player the winner', () => {
    const s = makeState({
      order: ['a', 'b'],
      hands: { a: [num('a1', 'red', 3)], b: [num('b1', 'blue', 1)] },
      top: num('t', 'red', 9)
    })
    const next = removePlayerFromGame(s, 'a')
    expect(next!.status).toBe('finished')
    expect(next!.winnerId).toBe('b')
  })

  it('returns null when the last player leaves', () => {
    const s = makeState({
      order: ['a'],
      hands: { a: [num('a1', 'red', 3)] },
      top: num('t', 'red', 9)
    })
    expect(removePlayerFromGame(s, 'a')).toBeNull()
  })
})
