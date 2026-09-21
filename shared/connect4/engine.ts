/**
 * Pure Connect 4 rules — no React, no networking, no I/O beyond Math.random.
 *
 * Two layers live here:
 *   1. Board primitives (`createConnect4Board`, `dropDisc`, `checkWinner`, …)
 *      operating on a plain {@link Connect4Board}. These are the easily unit
 *      tested, side-effect-free rules the UI must never re-implement.
 *   2. The authoritative game state ({@link Connect4GameState}) and its reducer
 *      ({@link dropDiscForPlayer}), which the server drives through the engine
 *      adapter in `game.ts`. The server is authoritative: clients only ever send
 *      an intended column.
 */
import {
  COLUMNS,
  CONNECT,
  ROWS,
  SEAT_COLORS,
  isColumnInRange,
  type Connect4Board,
  type Connect4Cell,
  type Connect4Coord,
  type Connect4PlayerColor
} from './types'

// ---------------------------------------------------------------------------
// Board primitives (pure, testable)
// ---------------------------------------------------------------------------

/** A fresh empty board: `ROWS` rows of `COLUMNS` empty cells. */
export function createConnect4Board(): Connect4Board {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLUMNS }, () => null as Connect4Cell)
  )
}

/**
 * The lowest empty row index in `column` (the row a dropped disc would land on),
 * or -1 if the column is full or out of range. "Lowest" is the largest row index
 * because row 0 is the top of the board.
 */
export function getAvailableRow(board: Connect4Board, column: number): number {
  if (!isColumnInRange(column)) return -1
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][column] === null) return row
  }
  return -1
}

/** Whether a disc may legally be dropped into `column` (in range and not full). */
export function isValidMove(board: Connect4Board, column: number): boolean {
  return getAvailableRow(board, column) !== -1
}

/**
 * Drop `player`'s disc into `column`, returning a new board plus the landing
 * coordinate. Returns null (leaving the input untouched) if the move is illegal.
 * Immutable: the input board is never mutated.
 */
export function dropDisc(
  board: Connect4Board,
  column: number,
  player: Connect4PlayerColor
): { board: Connect4Board; row: number } | null {
  const row = getAvailableRow(board, column)
  if (row === -1) return null
  const next = board.map((r) => r.slice())
  next[row][column] = player
  return { board: next, row }
}

/** Whether every cell is occupied. */
export function isBoardFull(board: Connect4Board): boolean {
  return board.every((row) => row.every((cell) => cell !== null))
}

// The four line directions to scan: horizontal, vertical, and both diagonals.
// Each is a (rowStep, colStep) pair; scanning from every cell covers all lines.
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // horizontal →
  [1, 0], // vertical ↓
  [1, 1], // diagonal descending ↘
  [-1, 1] // diagonal ascending ↗
]

function cellAt(board: Connect4Board, row: number, column: number): Connect4Cell {
  if (row < 0 || row >= ROWS || column < 0 || column >= COLUMNS) return null
  return board[row][column]
}

/**
 * The full contiguous run (length ≥ {@link CONNECT}) of `player`'s discs, if one
 * exists, as an ordered list of coordinates — otherwise null. Works for runs
 * longer than four: the entire connected line is returned, so a five-in-a-row is
 * still reported (and can be highlighted) in full.
 *
 * Only runs are reported from their starting cell (i.e. where the previous cell
 * in the same direction is not the player's), so each maximal line is found once
 * and returned complete.
 */
export function getWinningCells(
  board: Connect4Board,
  player: Connect4PlayerColor
): Connect4Coord[] | null {
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      if (board[row][column] !== player) continue
      for (const [dr, dc] of DIRECTIONS) {
        // Only start counting at the beginning of a run in this direction.
        if (cellAt(board, row - dr, column - dc) === player) continue
        const cells: Connect4Coord[] = []
        let r = row
        let c = column
        while (cellAt(board, r, c) === player) {
          cells.push({ row: r, column: c })
          r += dr
          c += dc
        }
        if (cells.length >= CONNECT) return cells
      }
    }
  }
  return null
}

/** Whether `player` has at least four connected discs anywhere on the board. */
export function checkWinner(board: Connect4Board, player: Connect4PlayerColor): boolean {
  return getWinningCells(board, player) !== null
}

// ---------------------------------------------------------------------------
// Authoritative game state
// ---------------------------------------------------------------------------

/** Feedback about the most recently placed disc, surfaced for drop animation. */
export interface Connect4LastMove {
  /** Player id who dropped the disc. */
  by: string
  color: Connect4PlayerColor
  row: number
  column: number
}

/** Authoritative server state. Connect 4 has no hidden information. */
export interface Connect4GameState {
  status: 'playing' | 'finished'
  /** Ordered player ids; index 0 is red, index 1 is yellow. */
  playerOrder: string[]
  /** Colour assigned to each player id. */
  colors: Record<string, Connect4PlayerColor>
  currentPlayerIndex: number
  board: Connect4Board
  /** Set when a player has connected four; absent on a draw or mid-game. */
  winnerId?: string
  /** The winning line (four or more cells) when the game was won. */
  winningCells?: Connect4Coord[]
  /** True when the game ended with a full board and no winner. */
  draw: boolean
  lastMove?: Connect4LastMove
}

export type ActionErrorCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER'

export type ActionResult =
  | { ok: true; state: Connect4GameState }
  | { ok: false; code: ActionErrorCode; message: string }

function fail(code: ActionErrorCode, message: string): ActionResult {
  return { ok: false, code, message }
}

/**
 * Create a new game for an ordered list of player ids (exactly two). The first
 * seat is red, the second yellow, and the starting player is chosen at random —
 * so rematches (which re-run createGame with the same order) alternate fairly.
 * `rng` is injectable for deterministic tests.
 */
export function createGame(
  playerOrder: string[],
  rng: () => number = Math.random
): Connect4GameState {
  const colors: Record<string, Connect4PlayerColor> = {}
  playerOrder.forEach((id, i) => {
    colors[id] = SEAT_COLORS[i] ?? 'red'
  })
  return {
    status: 'playing',
    playerOrder: [...playerOrder],
    colors,
    currentPlayerIndex: playerOrder.length > 0 ? Math.floor(rng() * playerOrder.length) : 0,
    board: createConnect4Board(),
    draw: false
  }
}

export function currentPlayerId(state: Connect4GameState): string {
  return state.playerOrder[state.currentPlayerIndex]
}

/**
 * Drop `playerId`'s disc into `column`. Fully server-authoritative: verifies the
 * game is live, that it is the player's turn, that the column is in range and not
 * full; then places the disc, checks for a win or draw, and otherwise advances
 * the turn. The disc colour comes from the server's colour assignment — a client
 * can never claim to move as another colour, because it only sends a column.
 */
export function dropDiscForPlayer(
  state: Connect4GameState,
  playerId: string,
  column: number
): ActionResult {
  if (state.status !== 'playing') return fail('GAME_OVER', 'The game has already finished.')
  if (currentPlayerId(state) !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn.')
  if (!isColumnInRange(column)) return fail('INVALID_ACTION', 'That column is off the board.')

  const color = state.colors[playerId]
  if (!color) return fail('INVALID_ACTION', 'You are not a player in this game.')

  const dropped = dropDisc(state.board, column, color)
  if (!dropped) return fail('INVALID_ACTION', 'That column is full.')

  const board = dropped.board
  const lastMove: Connect4LastMove = { by: playerId, color, row: dropped.row, column }

  const winningCells = getWinningCells(board, color)
  if (winningCells) {
    return {
      ok: true,
      state: { ...state, board, status: 'finished', winnerId: playerId, winningCells, lastMove }
    }
  }

  if (isBoardFull(board)) {
    return {
      ok: true,
      state: { ...state, board, status: 'finished', draw: true, lastMove }
    }
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.playerOrder.length
  return { ok: true, state: { ...state, board, currentPlayerIndex: nextIndex, lastMove } }
}

/**
 * Remove a player from an in-progress game (disconnect/leave). In a 1v1 match
 * this awards the remaining player the win. Returns null if nobody remains. A
 * finished game keeps its result intact so the results screen is stable.
 */
export function removePlayerFromGame(
  state: Connect4GameState,
  playerId: string
): Connect4GameState | null {
  if (!state.playerOrder.includes(playerId)) return state
  const playerOrder = state.playerOrder.filter((id) => id !== playerId)
  if (playerOrder.length === 0) return null

  const colors = { ...state.colors }
  delete colors[playerId]

  if (state.status === 'finished') {
    return { ...state, playerOrder, colors, currentPlayerIndex: 0 }
  }
  return {
    ...state,
    playerOrder,
    colors,
    currentPlayerIndex: 0,
    status: 'finished',
    winnerId: playerOrder[0],
    draw: false
  }
}
