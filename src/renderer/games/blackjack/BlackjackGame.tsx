import type { BlackjackView, BlackjackHandView, BlackjackPlayerView } from '@shared/blackjack/view'
import type { BlackjackHandStatus } from '@shared/blackjack/engine'
import { formatChips } from '@shared/blackjack/rules'
import { Button } from '../../components/Button'
import { CardHand } from '../../components/cards/CardHand'
import type { GameUIProps } from '../ui'
import styles from './BlackjackGame.module.css'

const HAND_STATUS_LABEL: Record<BlackjackHandStatus, string> = {
  playing: 'Playing',
  standing: 'Standing',
  busted: 'Busted',
  blackjack: 'Blackjack!'
}

const RESULT_LABEL: Record<string, string> = {
  win: 'Won',
  lose: 'Lost',
  push: 'Push',
  blackjack: 'Blackjack',
  bust: 'Busted'
}

/** The banner shown in the centre of the table for the current situation. */
function centreMessage(view: BlackjackView, nameOf: (id: string) => string): string {
  if (view.status === 'match_over') {
    const won = view.winnerId === view.selfId
    if (won) return 'You win the match! 🏆'
    return view.winnerId ? `${nameOf(view.winnerId)} wins the match.` : 'Match over.'
  }
  if (view.status === 'finished') return 'Match over.'
  if (view.status === 'hand_over') return view.lastEvent ?? 'Hand complete.'
  if (view.yourTurn) {
    const self = view.players.find((p) => p.isSelf)
    if (self && self.hands.length > 1) {
      return `Playing hand ${self.activeHandIndex + 1} of ${self.hands.length}.`
    }
    return 'Your turn — hit, stand, split or double down.'
  }
  if (view.currentPlayerId) return `${nameOf(view.currentPlayerId)} is playing…`
  return 'Dealing…'
}

export function BlackjackGame({ room, view, sendAction, onLeave }: GameUIProps) {
  const state = view as BlackjackView
  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const connectedById = new Map(room.players.map((p) => [p.id, p.connected]))

  const self = state.players.find((p) => p.isSelf)
  const others = state.players.filter((p) => !p.isSelf)
  const handOver = state.status === 'hand_over'
  const matchOver = state.status === 'match_over'
  // Both the between-hands and match-over phases show settled per-hand results.
  const showResult = handOver || matchOver
  const eliminated = self?.status === 'eliminated'

  const dealerTotalLabel = state.dealer.revealed
    ? String(state.dealer.visibleTotal)
    : `${state.dealer.visibleTotal} + ?`

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave game
        </button>
        <div className={styles.handInfo}>
          <span className={styles.handNo}>Hand {state.handNumber}</span>
          <span className={styles.dealerRule}>
            Dealer stands on soft 17 · Blackjack pays 3:2 · First to 1,000 chips wins
          </span>
        </div>
      </div>

      {/* Dealer */}
      <section className={styles.dealer}>
        <div className={styles.dealerHead}>
          <h2>Dealer</h2>
          <span className={[styles.total, state.dealer.busted ? styles.bustText : ''].join(' ')}>
            {dealerTotalLabel}
            {state.dealer.busted ? ' · Bust' : ''}
            {state.dealer.blackjack ? ' · Blackjack' : ''}
          </span>
        </div>
        <CardHand cards={state.dealer.cards} size="lg" dealKey={state.handNumber} />
      </section>

      {/* Centre status */}
      <div className={styles.banner} role="status" aria-live="polite">
        {centreMessage(state, nameOf)}
      </div>

      {/* Other players */}
      {others.length > 0 ? (
        <div className={styles.others}>
          {others.map((p) => (
            <PlayerSeat
              key={p.playerId}
              player={p}
              name={nameOf(p.playerId)}
              showResult={showResult}
              handNumber={state.handNumber}
              connected={connectedById.get(p.playerId) ?? true}
            />
          ))}
        </div>
      ) : null}

      {/* Local player + controls */}
      {self ? (
        <section
          className={[
            styles.self,
            state.currentPlayerId === self.playerId ? styles.current : '',
            eliminated ? styles.eliminatedSeat : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className={styles.selfInfo}>
            <div className={styles.selfName}>
              <span>{nameOf(self.playerId)} (You)</span>
            </div>
            <div className={styles.chips}>
              <span className={styles.chipVal}>{formatChips(self.chips)}</span>
              <span className={styles.chipLabel}>chips</span>
            </div>
          </div>

          <div className={styles.selfHand}>
            {self.hands.length > 0 ? (
              <div className={styles.handsRow}>
                {self.hands.map((hand) => (
                  <HandBox
                    key={hand.id}
                    hand={hand}
                    handNumber={state.handNumber}
                    showResult={showResult}
                    showActive={self.hands.length > 1}
                  />
                ))}
              </div>
            ) : (
              <span className={styles.spectating}>Spectating — you have been eliminated.</span>
            )}
          </div>

          <div className={styles.controls}>
            {matchOver ? (
              <Button size="lg" onClick={() => sendAction({ type: 'finish' })}>
                See final results →
              </Button>
            ) : handOver ? (
              state.canStartNextHand ? (
                <Button size="lg" onClick={() => sendAction({ type: 'next_hand' })}>
                  Next hand
                </Button>
              ) : (
                <span className={styles.waitNote}>Waiting for the next hand…</span>
              )
            ) : (
              <>
                <Button size="lg" disabled={!state.canHit} onClick={() => sendAction({ type: 'hit' })}>
                  Hit
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  disabled={!state.canStand}
                  onClick={() => sendAction({ type: 'stand' })}
                >
                  Stand
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  disabled={!state.canSplit}
                  onClick={() => sendAction({ type: 'split' })}
                >
                  Split
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  disabled={!state.canDouble}
                  onClick={() => sendAction({ type: 'double' })}
                >
                  Double Down
                </Button>
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}

/** One hand of the local player: cards, bet, total and per-hand status/result. */
function HandBox({
  hand,
  handNumber,
  showResult,
  showActive
}: {
  hand: BlackjackHandView
  handNumber: number
  showResult: boolean
  showActive: boolean
}) {
  return (
    <div
      className={[
        styles.handBox,
        showActive && hand.isActive ? styles.activeHand : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.handBoxHead}>
        <HandBadge hand={hand} showResult={showResult} />
        <span className={styles.handBet}>
          Bet {formatChips(hand.bet)}
          {hand.doubled ? ' ×2' : ''}
        </span>
      </div>
      <CardHand cards={hand.cards} size="lg" dealKey={`${handNumber}-${hand.id}`} />
      <span className={styles.selfTotal}>{hand.total}</span>
    </div>
  )
}

function HandBadge({ hand, showResult }: { hand: BlackjackHandView; showResult: boolean }) {
  if (showResult && hand.lastResult) {
    const cls =
      hand.lastResult === 'win' || hand.lastResult === 'blackjack'
        ? styles.badgeWin
        : hand.lastResult === 'push'
          ? styles.badgePush
          : styles.badgeLose
    return <span className={[styles.badge, cls].join(' ')}>{RESULT_LABEL[hand.lastResult]}</span>
  }
  const label = hand.isBlackjack ? 'Blackjack!' : HAND_STATUS_LABEL[hand.status]
  const cls =
    hand.status === 'blackjack'
      ? styles.badgeWin
      : hand.status === 'busted'
        ? styles.badgeLose
        : styles.badgeNeutral
  return <span className={[styles.badge, cls].join(' ')}>{label}</span>
}

function PlayerSeat({
  player,
  name,
  showResult,
  handNumber,
  connected
}: {
  player: BlackjackPlayerView
  name: string
  showResult: boolean
  handNumber: number
  connected: boolean
}) {
  const isCurrent = player.hands.some((h) => h.isActive)
  const eliminated = player.status === 'eliminated'
  return (
    <div
      className={[
        styles.seat,
        isCurrent ? styles.current : '',
        eliminated ? styles.eliminatedSeat : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.seatHead}>
        <span className={styles.seatName}>
          {name}
          {!connected ? <span className={styles.offline}> (offline)</span> : null}
        </span>
        <span className={styles.seatChips}>
          {formatChips(player.chips)} chips
        </span>
      </div>
      {player.hands.length > 0 ? (
        <div className={styles.seatHands}>
          {player.hands.map((hand) => (
            <div
              key={hand.id}
              className={[styles.seatHand, hand.isActive ? styles.seatHandActive : '']
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.seatHandTop}>
                <HandBadge hand={hand} showResult={showResult} />
                <span className={styles.seatTotal}>{hand.cards.length ? hand.total : '—'}</span>
              </div>
              <CardHand cards={hand.cards} size="sm" dealKey={`${handNumber}-${hand.id}`} />
              {player.hands.length > 1 ? (
                <span className={styles.seatBet}>Bet {formatChips(hand.bet)}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <span className={styles.spectating}>Spectating</span>
      )}
    </div>
  )
}
