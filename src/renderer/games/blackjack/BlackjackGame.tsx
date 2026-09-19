import type { BlackjackView, BlackjackPlayerView } from '@shared/blackjack/view'
import type { BlackjackPlayerStatus } from '@shared/blackjack/engine'
import { formatChips } from '@shared/blackjack/rules'
import { Button } from '../../components/Button'
import { CardHand } from '../../components/cards/CardHand'
import type { GameUIProps } from '../ui'
import styles from './BlackjackGame.module.css'

const STATUS_LABEL: Record<BlackjackPlayerStatus, string> = {
  waiting: 'Waiting',
  playing: 'Playing',
  standing: 'Standing',
  busted: 'Busted',
  blackjack: 'Blackjack!',
  eliminated: 'Eliminated'
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
  if (view.status === 'finished') return 'Match over.'
  if (view.status === 'hand_over') return view.lastEvent ?? 'Hand complete.'
  if (view.yourTurn) return 'Your turn — hit, stand or double down.'
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
              isCurrent={state.currentPlayerId === p.playerId}
              handOver={handOver}
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
            self.status === 'eliminated' ? styles.eliminatedSeat : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className={styles.selfInfo}>
            <div className={styles.selfName}>
              <span>{nameOf(self.playerId)} (You)</span>
              <StatusBadge player={self} handOver={handOver} />
            </div>
            <div className={styles.chips}>
              <span className={styles.chipVal}>{formatChips(self.chips)}</span>
              <span className={styles.chipLabel}>chips</span>
              {self.bet > 0 ? <span className={styles.bet}>Bet {formatChips(self.bet)}</span> : null}
            </div>
          </div>

          <div className={styles.selfHand}>
            {self.cards.length > 0 ? (
              <>
                <CardHand cards={self.cards} size="lg" dealKey={state.handNumber} />
                <span className={styles.selfTotal}>{self.total}</span>
              </>
            ) : (
              <span className={styles.spectating}>Spectating — you have been eliminated.</span>
            )}
          </div>

          <div className={styles.controls}>
            {handOver ? (
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

function StatusBadge({ player, handOver }: { player: BlackjackPlayerView; handOver: boolean }) {
  if (handOver && player.lastResult) {
    const cls =
      player.lastResult === 'win' || player.lastResult === 'blackjack'
        ? styles.badgeWin
        : player.lastResult === 'push'
          ? styles.badgePush
          : styles.badgeLose
    return <span className={[styles.badge, cls].join(' ')}>{RESULT_LABEL[player.lastResult]}</span>
  }
  const cls =
    player.status === 'blackjack'
      ? styles.badgeWin
      : player.status === 'busted' || player.status === 'eliminated'
        ? styles.badgeLose
        : styles.badgeNeutral
  return <span className={[styles.badge, cls].join(' ')}>{STATUS_LABEL[player.status]}</span>
}

function PlayerSeat({
  player,
  name,
  isCurrent,
  handOver,
  handNumber,
  connected
}: {
  player: BlackjackPlayerView
  name: string
  isCurrent: boolean
  handOver: boolean
  handNumber: number
  connected: boolean
}) {
  return (
    <div
      className={[
        styles.seat,
        isCurrent ? styles.current : '',
        player.status === 'eliminated' ? styles.eliminatedSeat : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.seatHead}>
        <span className={styles.seatName}>
          {name}
          {!connected ? <span className={styles.offline}> (offline)</span> : null}
        </span>
        <StatusBadge player={player} handOver={handOver} />
      </div>
      {player.cards.length > 0 ? (
        <CardHand cards={player.cards} size="sm" dealKey={handNumber} />
      ) : (
        <span className={styles.spectating}>Spectating</span>
      )}
      <div className={styles.seatFoot}>
        <span className={styles.seatTotal}>{player.cards.length ? player.total : '—'}</span>
        <span className={styles.seatChips}>
          {formatChips(player.chips)} chips
          {player.bet > 0 ? ` · bet ${formatChips(player.bet)}` : ''}
        </span>
      </div>
    </div>
  )
}
