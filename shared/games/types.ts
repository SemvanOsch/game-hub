/**
 * Game-agnostic engine abstraction.
 *
 * The multiplayer core (rooms, sockets, dispatch) knows nothing about any
 * specific game. Each game implements a {@link GameEngine} and registers it in
 * `registry.ts`, providing:
 *   - initial state creation
 *   - client action validation
 *   - an authoritative action reducer
 *   - player-specific (sanitized) state serialization
 *   - disconnect handling
 *   - win/results reporting
 *
 * Keeping these behind one interface means new games never require `if (gameId
 * === 'x')` branches scattered through the server or client.
 */

export type ActionErrorCode = 'NOT_YOUR_TURN' | 'INVALID_ACTION' | 'GAME_OVER'

export type EngineActionResult<S> =
  | { ok: true; state: S }
  | { ok: false; code: ActionErrorCode; message: string }

/**
 * @typeParam S - authoritative server state (may contain hidden information)
 * @typeParam V - per-player client view (safe to send to that player)
 * @typeParam A - validated action type
 * @typeParam R - final results payload
 */
export interface GameEngine<S = unknown, V = unknown, A = unknown, R = unknown> {
  readonly id: string
  readonly minPlayers: number
  readonly maxPlayers: number

  /**
   * Build the initial authoritative state for an ordered list of player ids.
   * `options` carries optional, untrusted per-match settings chosen in the lobby
   * (opaque at this level); each engine validates and interprets its own.
   */
  createGame(playerOrder: string[], options?: unknown): S

  /** Parse/validate an untrusted client action. Returns null if invalid. */
  validateAction(raw: unknown): A | null

  /** Apply a validated action for a player, returning the next state or an error. */
  applyAction(state: S, playerId: string, action: A): EngineActionResult<S>

  /** Adjust state when a player leaves mid-game. Returns null if no game remains. */
  removePlayer(state: S, playerId: string): S | null

  /** Convert authoritative state into the safe view for one specific player. */
  getPlayerView(state: S, playerId: string): V

  isFinished(state: S): boolean

  /**
   * Optional server-driven timeout. Returns the absolute epoch-ms timestamp at
   * which the server should call {@link tick} for this state, or null when no
   * time-based transition is pending. The multiplayer core schedules a single
   * timer per room from this; games without time pressure simply omit it.
   */
  nextTimeout?(state: S): number | null

  /**
   * Optional time-based reducer. Called by the server once the wall clock passes
   * {@link nextTimeout} (with the current server time), letting the engine
   * advance transitions that depend on elapsed time rather than a client action
   * (e.g. a round timing out). Must be pure and return the next state.
   */
  tick?(state: S, now: number): S

  /** Final results payload, broadcast once the game finishes. */
  getResults(state: S): R

  /**
   * Player ids of the winner(s) of a finished game (more than one on a tie,
   * empty if there is no winner). Used by the server to record match results
   * without knowing anything game-specific. Only meaningful once
   * {@link isFinished} is true.
   */
  getWinnerIds(state: S): string[]
}
