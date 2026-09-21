import { describe, it, expect } from 'vitest'
import {
  COLUMNS,
  ROWS,
  type Connect4Board,
  type Connect4PlayerColor
} from './types'
import {
  createConnect4Board,
  dropDisc,
  getAvailableRow,
  isValidMove,
  isBoardFull,
  checkWinner,
  getWinningCells,
  createGame,
  dropDiscForPlayer,
  removePlayerFromGame,
  currentPlayerId,
  type Connect4GameState
} from './engine'

const R: Connect4PlayerColor = 'red'
const Y: Connect4PlayerColor = 'yellow'

/** Place a disc directly (bypassing gravity) for constructing win fixtures. */
function set(board: Connect4Board, row: number, column: number, c: Connect4PlayerColor): void {
  board[row][column] = c
}

/** A game with a deterministic starting player (red, seat 0). */
function newGame(): Connect4GameState {
  return createGame(['red-player', 'yellow-player'], () => 0)
}

describe('board creation', () => {
  it('has ROWS rows', () => {
    expect(createConnect4Board()).toHaveLength(ROWS)
    expect(ROWS).toBe(6)
  })

  it('has COLUMNS columns in each row', () => {
    const board = createConnect4Board()
    expect(COLUMNS).toBe(7)
    for (const row of board) expect(row).toHaveLength(COLUMNS)
  })

  it('starts with every cell empty', () => {
    const board = createConnect4Board()
    expect(board.every((row) => row.every((cell) => cell === null))).toBe(true)
  })
})

describe('valid moves', () => {
  it('drops a disc into an empty column onto the bottom row', () => {
    const board = createConnect4Board()
    const result = dropDisc(board, 3, R)
    expect(result).not.toBeNull()
    expect(result!.row).toBe(ROWS - 1)
    expect(result!.board[ROWS - 1][3]).toBe(R)
  })

  it('does not mutate the input board (immutability)', () => {
    const board = createConnect4Board()
    dropDisc(board, 3, R)
    expect(board[ROWS - 1][3]).toBeNull()
  })

  it('stacks additional discs on top of existing ones', () => {
    let board = createConnect4Board()
    board = dropDisc(board, 2, R)!.board
    board = dropDisc(board, 2, Y)!.board
    const third = dropDisc(board, 2, R)!
    expect(board[ROWS - 1][2]).toBe(R)
    expect(board[ROWS - 2][2]).toBe(Y)
    expect(third.row).toBe(ROWS - 3)
    expect(third.board[ROWS - 3][2]).toBe(R)
  })

  it('reports the next available row correctly as a column fills', () => {
    let board = createConnect4Board()
    expect(getAvailableRow(board, 0)).toBe(ROWS - 1)
    board = dropDisc(board, 0, R)!.board
    expect(getAvailableRow(board, 0)).toBe(ROWS - 2)
  })
})

describe('full columns', () => {
  it('cannot accept another disc once full', () => {
    let board = createConnect4Board()
    for (let i = 0; i < ROWS; i++) board = dropDisc(board, 1, i % 2 ? R : Y)!.board
    expect(isValidMove(board, 1)).toBe(false)
    expect(getAvailableRow(board, 1)).toBe(-1)
    expect(dropDisc(board, 1, R)).toBeNull()
  })
})

describe('win detection', () => {
  it('detects a horizontal win', () => {
    const board = createConnect4Board()
    for (let c = 0; c < 4; c++) set(board, ROWS - 1, c, R)
    expect(checkWinner(board, R)).toBe(true)
    expect(getWinningCells(board, R)).toHaveLength(4)
    expect(checkWinner(board, Y)).toBe(false)
  })

  it('detects a vertical win', () => {
    const board = createConnect4Board()
    for (let r = 0; r < 4; r++) set(board, ROWS - 1 - r, 5, Y)
    expect(checkWinner(board, Y)).toBe(true)
    expect(getWinningCells(board, Y)).toHaveLength(4)
  })

  it('detects a diagonal descending win (↘)', () => {
    const board = createConnect4Board()
    // row increases with column: top-left to bottom-right.
    for (let i = 0; i < 4; i++) set(board, i, i, R)
    expect(checkWinner(board, R)).toBe(true)
    const cells = getWinningCells(board, R)!
    expect(cells).toHaveLength(4)
  })

  it('detects a diagonal ascending win (↗)', () => {
    const board = createConnect4Board()
    // row decreases as column increases: bottom-left to top-right.
    for (let i = 0; i < 4; i++) set(board, ROWS - 1 - i, i, Y)
    expect(checkWinner(board, Y)).toBe(true)
    expect(getWinningCells(board, Y)).toHaveLength(4)
  })

  it('counts five-in-a-row as a win and returns the whole line', () => {
    const board = createConnect4Board()
    for (let c = 0; c < 5; c++) set(board, ROWS - 1, c, R)
    expect(checkWinner(board, R)).toBe(true)
    expect(getWinningCells(board, R)).toHaveLength(5)
  })

  it('does not report a win for three in a row', () => {
    const board = createConnect4Board()
    for (let c = 0; c < 3; c++) set(board, ROWS - 1, c, R)
    expect(checkWinner(board, R)).toBe(false)
    expect(getWinningCells(board, R)).toBeNull()
  })
})

describe('draw detection', () => {
  it('is not full while any cell is empty', () => {
    const board = createConnect4Board()
    expect(isBoardFull(board)).toBe(false)
  })

  it('recognises a completely full board', () => {
    const board = createConnect4Board()
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLUMNS; c++) set(board, r, c, R)
    expect(isBoardFull(board)).toBe(true)
  })

  it('ends the game in a draw when the last cell fills with no line', () => {
    // Build a full board with no four-in-a-row by shifting the colour pattern
    // every two columns (a standard Connect 4 no-winner fill).
    const state = newGame()
    const board = createConnect4Board()
    const pattern: Connect4PlayerColor[][] = []
    for (let c = 0; c < COLUMNS; c++) {
      const col: Connect4PlayerColor[] = []
      for (let r = 0; r < ROWS; r++) {
        const block = Math.floor(c / 2)
        col.push((r + block) % 2 === 0 ? R : Y)
      }
      pattern.push(col)
    }
    // Fill all but the top cell of the last column so the final drop completes it.
    for (let c = 0; c < COLUMNS; c++) {
      const fillRows = c === COLUMNS - 1 ? ROWS - 1 : ROWS
      for (let r = 0; r < fillRows; r++) set(board, ROWS - 1 - r, c, pattern[c][r])
    }
    expect(checkWinner(board, R)).toBe(false)
    expect(checkWinner(board, Y)).toBe(false)

    const topColor = pattern[COLUMNS - 1][ROWS - 1]
    const mover = state.playerOrder.find((id) => state.colors[id] === topColor)!
    const ready: Connect4GameState = { ...state, board, currentPlayerIndex: state.playerOrder.indexOf(mover) }
    const result = dropDiscForPlayer(ready, mover, COLUMNS - 1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.status).toBe('finished')
      expect(result.state.draw).toBe(true)
      expect(result.state.winnerId).toBeUndefined()
    }
  })
})

describe('turn validation', () => {
  it('lets the current player move and advances the turn', () => {
    const state = newGame()
    const first = currentPlayerId(state)
    const result = dropDiscForPlayer(state, first, 3)
    expect(result.ok).toBe(true)
    if (result.ok) expect(currentPlayerId(result.state)).not.toBe(first)
  })

  it('rejects a move from the wrong player', () => {
    const state = newGame()
    const wrong = state.playerOrder.find((id) => id !== currentPlayerId(state))!
    const result = dropDiscForPlayer(state, wrong, 3)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('NOT_YOUR_TURN')
  })

  it('rejects a move after the game is over', () => {
    const state = newGame()
    const finished: Connect4GameState = { ...state, status: 'finished', winnerId: currentPlayerId(state) }
    const result = dropDiscForPlayer(finished, currentPlayerId(state), 3)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('GAME_OVER')
  })
})

describe('security', () => {
  it('places discs only in the mover\'s assigned colour (no owner spoofing)', () => {
    // The reducer takes only a column; colour is server-assigned, so a player
    // can never drop the opponent's colour.
    const state = newGame()
    const mover = currentPlayerId(state)
    const result = dropDiscForPlayer(state, mover, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state.lastMove!.color).toBe(state.colors[mover])
  })

  it('rejects an out-of-range (too high) column', () => {
    const state = newGame()
    const result = dropDiscForPlayer(state, currentPlayerId(state), COLUMNS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_ACTION')
  })

  it('rejects a negative column', () => {
    const state = newGame()
    const result = dropDiscForPlayer(state, currentPlayerId(state), -1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_ACTION')
  })

  it('rejects a non-integer column', () => {
    const state = newGame()
    const result = dropDiscForPlayer(state, currentPlayerId(state), 2.5)
    expect(result.ok).toBe(false)
  })

  it('rejects a move into a full column', () => {
    const state = newGame()
    const board = createConnect4Board()
    for (let r = 0; r < ROWS; r++) set(board, r, 0, r % 2 ? R : Y)
    const full: Connect4GameState = { ...state, board }
    const result = dropDiscForPlayer(full, currentPlayerId(full), 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_ACTION')
  })

  it('rejects a move from a player not in the game', () => {
    const state = newGame()
    const result = dropDiscForPlayer(state, 'stranger', 0)
    expect(result.ok).toBe(false)
    // Not the current player, so treated as an out-of-turn attempt.
    if (!result.ok) expect(result.code).toBe('NOT_YOUR_TURN')
  })
})

describe('game flow', () => {
  it('finishes with a winner on a vertical four', () => {
    let state = newGame()
    const first = currentPlayerId(state)
    const second = state.playerOrder.find((id) => id !== first)!
    // First player drops four in column 0; second player answers in column 1.
    for (let i = 0; i < 3; i++) {
      state = (dropDiscForPlayer(state, first, 0) as { ok: true; state: Connect4GameState }).state
      state = (dropDiscForPlayer(state, second, 1) as { ok: true; state: Connect4GameState }).state
    }
    const winning = dropDiscForPlayer(state, first, 0)
    expect(winning.ok).toBe(true)
    if (winning.ok) {
      expect(winning.state.status).toBe('finished')
      expect(winning.state.winnerId).toBe(first)
      expect(winning.state.winningCells).toHaveLength(4)
    }
  })

  it('assigns red to seat 0 and yellow to seat 1', () => {
    const state = createGame(['a', 'b'], () => 0)
    expect(state.colors.a).toBe('red')
    expect(state.colors.b).toBe('yellow')
  })
})

describe('removePlayerFromGame', () => {
  it('awards the win to the remaining player mid-game', () => {
    const state = newGame()
    const leaver = state.playerOrder[0]
    const next = removePlayerFromGame(state, leaver)
    expect(next).not.toBeNull()
    expect(next!.status).toBe('finished')
    expect(next!.winnerId).toBe(state.playerOrder[1])
  })

  it('returns null when the last player leaves', () => {
    const state = createGame(['solo'], () => 0)
    expect(removePlayerFromGame(state, 'solo')).toBeNull()
  })

  it('preserves the result when someone leaves a finished game', () => {
    const state = newGame()
    const finished: Connect4GameState = { ...state, status: 'finished', winnerId: state.playerOrder[0] }
    const next = removePlayerFromGame(finished, state.playerOrder[1])
    expect(next!.winnerId).toBe(state.playerOrder[0])
  })
})
