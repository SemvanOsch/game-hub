/**
 * Client-facing (sanitized) Beverbende types and the state serializer.
 *
 * SECURITY: the authoritative {@link BeverbendeState} holds every player's four card
 * identities, each player's per-position knowledge, and the full draw-pile order. A
 * client must NEVER receive a card identity it is not entitled to. {@link getPlayerView}
 * is the single choke point that strips hidden information:
 *   - a player sees the identity of their OWN card only for positions they know;
 *   - opponents' card identities are omitted from the wire during play (not merely
 *     hidden in the UI) — only during the end-of-round reveal is every card serialized;
 *   - the drawn card being decided is serialized ONLY to the acting player;
 *   - the draw pile is a count only; the discard exposes only its face-up top card.
 * `shared/beverbende/view.test.ts` guards these invariants.
 */
import type { BeverbendeCard } from './cards'
import type { BeverbendeState, BeverbendeServerPlayer, Pending } from './engine'

/** One of a player's four card positions as seen by a particular viewer. */
export interface CardSlot {
  /** The card identity — present only when this viewer is entitled to see it. */
  card: BeverbendeCard | null
  /** Whether this viewer currently knows/sees this card. */
  known: boolean
}

/** Public per-player summary. Identities appear only where the viewer may see them. */
export interface BeverbendePlayerView {
  playerId: string
  isSelf: boolean
  cards: CardSlot[]
  ready: boolean
  cumulativeScore: number
  roundScore: number | null
}

/** The acting player's own in-turn sub-state (never sent to other players). */
export type PendingView =
  | { kind: 'decide'; card: BeverbendeCard; drawTwoStage?: 1 | 2; canUse: boolean }
  | { kind: 'peek' }
  | { kind: 'swap' }

export interface BeverbendeView {
  status: BeverbendeState['status']
  round: number
  totalRounds: number
  selfId: string
  /** Players in seat order. */
  players: BeverbendePlayerView[]
  drawPileCount: number
  /** The face-up top of the discard pile (public), or null when empty. */
  discardTop: BeverbendeCard | null
  discardCount: number
  currentPlayerId: string
  yourTurn: boolean
  /** The local player's own pending sub-state; null unless it is their turn. */
  pending: PendingView | null
  /** The kind of the current player's pending action (no identity) — for opponents'
   *  "peeking…/swapping…" hints without leaking the card. */
  currentActionKind: Pending['kind'] | null
  roundEndingPlayerId: string | null
  finalTurnsLeft: number | null
  turnStartedAt: number
  /** Epoch-ms the server will next act (turn/phase timer) — for a client countdown. */
  deadline: number
  /** The server's clock at serialization time, for client countdown calibration. */
  serverNow: number
  /** Per-player scores of the just-finished round (present on roundOver/finished). */
  roundScores?: Record<string, number>
  winnerIds?: string[]
  lastEvent?: string
  /** Player id the last event is attributed to (the actor may no longer be the
   *  current player after their turn ends). */
  lastActorId?: string
  /** The two slots exchanged by the most recent swap (positions only, no identities),
   *  for a client cross-table animation. Present only on the swap's own view. */
  lastSwap?: { aId: string; aPos: number; bId: string; bPos: number }
}

export interface BeverbendeResults {
  winnerIds: string[]
  totalRounds: number
  /** Final cumulative score per player id. */
  cumulative: Record<string, number>
  /** Players sorted by ascending cumulative score (lowest — the winner — first). */
  standings: { playerId: string; score: number }[]
}

/** Whether every card is revealed to everyone (end-of-round reveal / game over). */
function isRevealAll(status: BeverbendeState['status']): boolean {
  return status === 'roundOver' || status === 'finished'
}

/** Build one player's card slots as seen by `viewerId`. */
function slotsFor(
  player: BeverbendeServerPlayer,
  viewerId: string,
  revealAll: boolean
): CardSlot[] {
  const isSelf = player.playerId === viewerId
  return player.cards.map((card, i) => {
    // Reveal a card only when: the round is being scored (all revealed), or the
    // viewer is the owner and knows this position. Opponents' cards are otherwise
    // omitted entirely — the identity never reaches the wire.
    const visible = revealAll || (isSelf && player.known[i])
    return { card: visible ? card : null, known: visible }
  })
}

/**
 * Produce the safe, player-specific view. Only card identities the viewer is entitled
 * to see are included; the drawn card being decided is included only for the acting
 * player.
 */
export function getPlayerView(state: BeverbendeState, playerId: string): BeverbendeView {
  const revealAll = isRevealAll(state.status)

  const players: BeverbendePlayerView[] = state.playerOrder.map((id) => {
    const p = state.players[id]
    return {
      playerId: id,
      isSelf: id === playerId,
      cards: slotsFor(p, playerId, revealAll),
      ready: p.ready,
      cumulativeScore: p.cumulativeScore,
      roundScore: p.roundScore
    }
  })

  const yourTurn = state.status === 'playing' && state.currentPlayerId === playerId

  // The pending drawn card is private: serialize the pending sub-state only to the
  // acting player. Everyone else sees just its kind (no card identity).
  let pending: PendingView | null = null
  if (yourTurn && state.pending) {
    const pd = state.pending
    if (pd.kind === 'decide') {
      pending = {
        kind: 'decide',
        card: pd.card,
        drawTwoStage: pd.drawTwoStage,
        canUse: pd.card.type !== 'number'
      }
    } else {
      pending = { kind: pd.kind }
    }
  }

  const discardTop =
    state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null

  return {
    status: state.status,
    round: state.round,
    totalRounds: state.totalRounds,
    selfId: playerId,
    players,
    drawPileCount: state.drawPile.length,
    discardTop,
    discardCount: state.discardPile.length,
    currentPlayerId: state.currentPlayerId,
    yourTurn,
    pending,
    currentActionKind: state.pending ? state.pending.kind : null,
    roundEndingPlayerId: state.roundEndingPlayerId,
    finalTurnsLeft: state.finalTurnsLeft,
    turnStartedAt: state.turnStartedAt,
    deadline: state.deadline,
    serverNow: Date.now(),
    roundScores: state.roundScores,
    winnerIds: state.winnerIds,
    lastEvent: state.lastEvent,
    lastActorId: state.lastActorId,
    lastSwap: state.lastSwap
  }
}

export function getResults(state: BeverbendeState): BeverbendeResults {
  const cumulative: Record<string, number> = {}
  for (const id of state.playerOrder) cumulative[id] = state.players[id].cumulativeScore
  const standings = state.playerOrder
    .map((id) => ({ playerId: id, score: cumulative[id] }))
    .sort((a, b) => a.score - b.score)
  return {
    winnerIds: state.winnerIds ?? [],
    totalRounds: state.totalRounds,
    cumulative,
    standings
  }
}
