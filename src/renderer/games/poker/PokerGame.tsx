import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  LegalActions,
  PokerPlayerView,
  PokerView
} from '@shared/poker/view'
import type { PokerActionLogEntry } from '@shared/poker/engine'
import { Button } from '../../components/Button'
import { CardHand } from '../../components/cards/CardHand'
import { ChipStack } from '../../components/chips/ChipStack'
import type { GameUIProps } from '../ui'
import { CheatSheet } from './CheatSheet'
import styles from './PokerGame.module.css'

const PHASE_LABEL: Record<PokerView['phase'], string> = {
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Turn an action-log entry into a compact human line (names resolved by caller). */
function logText(entry: PokerActionLogEntry, nameOf: (id: string) => string): string {
  const who = entry.playerId ? nameOf(entry.playerId) : ''
  switch (entry.kind) {
    case 'small_blind':
      return `${who} posts small blind (${entry.amount})`
    case 'big_blind':
      return `${who} posts big blind (${entry.amount})`
    case 'fold':
      return `${who} folds`
    case 'check':
      return `${who} checks`
    case 'call':
      return `${who} calls ${entry.amount}`
    case 'bet':
      return `${who} bets ${entry.amount}`
    case 'raise':
      return `${who} raises to ${entry.amount}`
    case 'all_in':
      return `${who} is all in (${entry.amount})`
    case 'phase':
      return entry.phase === 'flop'
        ? 'The flop is dealt'
        : entry.phase === 'turn'
          ? 'The turn is dealt'
          : entry.phase === 'river'
            ? 'The river is dealt'
            : 'Next street'
    case 'win':
      return `${who} wins ${entry.amount}`
    default:
      return ''
  }
}

/** Angle (radians) of a seat around the oval; index 0 (self) is at the bottom. */
function seatAngle(index: number, count: number): number {
  return (90 + (360 / count) * index) * (Math.PI / 180)
}

/** Compute the seat position (percent left/top) around the oval, self at bottom. */
function seatStyle(index: number, count: number): { left: string; top: string } {
  const angle = seatAngle(index, count)
  return { left: `${50 + 45 * Math.cos(angle)}%`, top: `${50 + 43 * Math.sin(angle)}%` }
}

/** A player's committed bet sits on the felt between their seat and the pot, so it
 *  never overlaps their own stack. Same angle as the seat, smaller radius. */
function betStyle(index: number, count: number): { left: string; top: string } {
  const angle = seatAngle(index, count)
  return { left: `${50 + 31 * Math.cos(angle)}%`, top: `${50 + 30 * Math.sin(angle)}%` }
}

export function PokerGame({ room, view, sendAction, onLeave }: GameUIProps) {
  const state = view as PokerView
  const nameById = useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players])
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const connectedById = useMemo(
    () => new Map(room.players.map((p) => [p.id, p.connected])),
    [room.players]
  )

  const [cheatSheetOpen, setCheatSheetOpen] = useState(true)

  const self = state.players.find((p) => p.isSelf)
  // Reorder so the local player sits at the bottom, others fan out clockwise.
  const selfIndex = state.players.findIndex((p) => p.isSelf)
  const seats =
    selfIndex >= 0
      ? [...state.players.slice(selfIndex), ...state.players.slice(0, selfIndex)]
      : state.players

  const handOver = state.status === 'hand_over'
  const matchOver = state.status === 'match_over'
  // Both between-hands and match-over show settled per-hand results in the seats.
  const showResult = handOver || matchOver
  const currentName = state.currentPlayerId ? nameOf(state.currentPlayerId) : ''
  const winnerName = state.winnerId ? nameOf(state.winnerId) : ''

  const centreMessage = matchOver
    ? state.winnerId === state.selfId
      ? 'You win the game!'
      : winnerName
        ? `${winnerName} wins the game`
        : 'Game over'
    : handOver
      ? state.lastHand?.showdown
        ? 'Showdown'
        : 'Hand complete'
      : state.yourTurn
        ? 'Your turn'
        : currentName
          ? `${currentName} to act`
          : PHASE_LABEL[state.phase]

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave game
        </button>
        <div className={styles.handInfo}>
          <span className={styles.handNo}>Hand {state.handNumber}</span>
          <span className={styles.rule}>
            No-Limit Hold’em · Blinds {state.smallBlind}/{state.bigBlind} · Last player standing wins
          </span>
        </div>
      </div>

      <div className={[styles.layout, cheatSheetOpen ? '' : styles.layoutCollapsed].filter(Boolean).join(' ')}>
        <CheatSheet open={cheatSheetOpen} onToggle={() => setCheatSheetOpen((v) => !v)} />

        <div className={styles.main}>
          <div className={styles.tableWrap}>
            <div className={styles.table}>
              {/* Centre: pot + community cards + phase */}
              <div className={styles.centre}>
                <div className={styles.phaseTag}>{PHASE_LABEL[state.phase]}</div>
                <div className={styles.pot}>
                  <span className={styles.potLabel}>Pot</span>
                  <span className={styles.potValue}>{state.pot.toLocaleString()}</span>
                </div>
                {state.pots.length > 1 && state.players.some((p) => p.allIn) ? (
                  <div className={styles.sidePots}>
                    {state.pots.map((pot, i) => (
                      <span key={i} className={styles.sidePot}>
                        {i === 0 ? 'Main' : `Side ${i}`}: {pot.amount.toLocaleString()}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className={styles.community}>
                  <CardHand
                    cards={state.communityCards}
                    size="md"
                    dealKey={`${state.handNumber}-${state.communityCards.length}`}
                  />
                </div>
                <div className={styles.banner} role="status" aria-live="polite">
                  {centreMessage}
                </div>
              </div>

              {/* Committed bets, on the felt between each seat and the pot */}
              {seats.map((player, i) =>
                player.bet > 0 ? (
                  <div
                    key={`bet-${player.playerId}`}
                    className={styles.betAnchor}
                    style={betStyle(i, seats.length)}
                  >
                    <ChipStack amount={player.bet} size="small" maxChips={4} />
                  </div>
                ) : null
              )}

              {/* Seats around the oval */}
              {seats.map((player, i) => (
                <div
                  key={player.playerId}
                  className={styles.seatAnchor}
                  style={seatStyle(i, seats.length)}
                >
                  <Seat
                    player={player}
                    name={nameOf(player.playerId)}
                    connected={connectedById.get(player.playerId) ?? true}
                    handNumber={state.handNumber}
                    showResult={showResult}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Action / status bar */}
          <div className={styles.actionArea}>
            {matchOver ? (
              <div className={styles.handOver}>
                <div className={styles.handOverText}>
                  {state.winnerId === state.selfId
                    ? 'You are the last player with chips!'
                    : winnerName
                      ? `${winnerName} is the last player with chips.`
                      : 'The game is over.'}
                </div>
                <Button size="lg" onClick={() => sendAction({ type: 'finish' })}>
                  See final results →
                </Button>
              </div>
            ) : handOver ? (
              <HandOverBar
                view={state}
                nameOf={nameOf}
                onNext={() => sendAction({ type: 'next_hand' })}
              />
            ) : self && self.eliminated ? (
              <span className={styles.waitNote}>You have been eliminated — spectating.</span>
            ) : state.yourTurn ? (
              <ActionControls view={state} sendAction={sendAction} />
            ) : (
              <div className={styles.turnWait}>
                <span className={styles.waitNote}>
                  {currentName ? `Waiting for ${currentName}…` : 'Dealing…'}
                </span>
                {state.selfBestHand ? (
                  <span className={styles.bestHand}>Your hand: {state.selfBestHand}</span>
                ) : null}
              </div>
            )}
          </div>

          {/* Compact history */}
          <ActionLog entries={state.actionLog} nameOf={nameOf} />
        </div>
      </div>
    </div>
  )
}

/** One seat around the table. */
function Seat({
  player,
  name,
  connected,
  handNumber,
  showResult
}: {
  player: PokerPlayerView
  name: string
  connected: boolean
  handNumber: number
  showResult: boolean
}) {
  const classes = [
    styles.seat,
    player.isSelf ? styles.selfSeat : '',
    player.isCurrent ? styles.current : '',
    player.folded ? styles.folded : '',
    player.eliminated ? styles.eliminated : ''
  ]
    .filter(Boolean)
    .join(' ')

  const won = showResult && (player.winnings ?? 0) > 0

  return (
    <div className={classes}>
      <div className={styles.blindBadges}>
        {player.isDealer ? (
          <span className={[styles.chipBadge, styles.dealerBadge].join(' ')} title="Dealer">
            D
          </span>
        ) : null}
        {player.isSmallBlind ? (
          <span className={[styles.chipBadge, styles.sbBadge].join(' ')} title="Small blind">
            SB
          </span>
        ) : null}
        {player.isBigBlind ? (
          <span className={[styles.chipBadge, styles.bbBadge].join(' ')} title="Big blind">
            BB
          </span>
        ) : null}
      </div>

      <div className={styles.seatCards}>
        {player.holeCards.length > 0 ? (
          <CardHand
            cards={player.holeCards}
            size="sm"
            dealKey={`${handNumber}-${player.playerId}`}
          />
        ) : (
          <div className={styles.noCards} aria-hidden />
        )}
      </div>

      <div className={styles.seatInfo}>
        <span className={styles.seatName}>
          {name}
          {player.isSelf ? ' (You)' : ''}
          {!connected ? <span className={styles.offline}> · offline</span> : null}
        </span>
        <span className={styles.seatChips}>{player.chips.toLocaleString()} chips</span>
        {player.handLabel ? <span className={styles.seatHandLabel}>{player.handLabel}</span> : null}
      </div>

      <div className={styles.seatStatus}>
        {player.eliminated ? (
          <span className={[styles.tag, styles.tagOut].join(' ')}>Eliminated</span>
        ) : player.allIn ? (
          <span className={[styles.tag, styles.tagAllIn].join(' ')}>All in</span>
        ) : player.folded ? (
          <span className={[styles.tag, styles.tagFold].join(' ')}>Folded</span>
        ) : won ? (
          <span className={[styles.tag, styles.tagWin].join(' ')}>+{player.winnings}</span>
        ) : null}
      </div>
    </div>
  )
}

/** The between-hands bar: winners summary + start-next-hand control. */
function HandOverBar({
  view,
  nameOf,
  onNext
}: {
  view: PokerView
  nameOf: (id: string) => string
  onNext: () => void
}) {
  const winners = view.lastHand
    ? Object.entries(view.lastHand.winnings)
        .filter(([, amount]) => amount > 0)
        .map(([id, amount]) => `${nameOf(id)} wins ${amount.toLocaleString()}`)
    : []

  return (
    <div className={styles.handOver}>
      <div className={styles.handOverText}>
        {winners.length > 0 ? winners.join(' · ') : 'Hand complete.'}
      </div>
      {view.canStartNextHand ? (
        <Button size="lg" onClick={onNext}>
          Next hand
        </Button>
      ) : (
        <span className={styles.waitNote}>Waiting for the next hand…</span>
      )}
    </div>
  )
}

/** The local player's action controls (fold / check / call / bet-raise / all-in). */
function ActionControls({
  view,
  sendAction
}: {
  view: PokerView
  sendAction: (action: unknown) => void
}) {
  const legal: LegalActions = view.legal
  const isBet = legal.canBet
  const canSize = legal.canBet || legal.canRaise
  const min = isBet ? legal.minBet : legal.minRaise
  const max = isBet ? legal.maxBet : legal.maxRaise

  const [amount, setAmount] = useState(min)
  // Reset the slider whenever the actionable context changes.
  useEffect(() => {
    setAmount(min)
  }, [min, max, view.currentPlayerId, view.phase, view.handNumber, view.currentBet])

  // Pot-fraction presets. For a raise, the reference pot includes the pending call.
  const refPot = view.pot + legal.callAmount
  const targetFor = (fraction: number): number => {
    const raw = isBet
      ? Math.round(fraction * view.pot)
      : Math.round(view.currentBet + fraction * refPot)
    return clamp(raw, min, max)
  }

  const submit = (): void => {
    const value = clamp(Math.round(amount), min, max)
    sendAction({ type: isBet ? 'bet' : 'raise', amount: value })
  }

  return (
    <div className={styles.controls}>
      <div className={styles.controlRow}>
        <Button
          size="lg"
          variant="ghost"
          disabled={!legal.canFold}
          onClick={() => sendAction({ type: 'fold' })}
        >
          Fold
        </Button>
        {legal.canCheck ? (
          <Button size="lg" variant="secondary" onClick={() => sendAction({ type: 'check' })}>
            Check
          </Button>
        ) : (
          <Button
            size="lg"
            variant="secondary"
            disabled={!legal.canCall}
            onClick={() => sendAction({ type: 'call' })}
          >
            Call {legal.callAmount.toLocaleString()}
          </Button>
        )}
        {canSize ? (
          <Button size="lg" onClick={submit}>
            {isBet ? 'Bet' : 'Raise to'} {amount.toLocaleString()}
          </Button>
        ) : null}
        <Button
          size="lg"
          variant="secondary"
          disabled={!legal.canAllIn}
          onClick={() => sendAction({ type: 'all_in' })}
        >
          All in ({legal.allInAmount.toLocaleString()})
        </Button>
      </div>

      {canSize && max > min ? (
        <div className={styles.sizeRow}>
          <input
            className={styles.slider}
            type="range"
            min={min}
            max={max}
            step={view.bigBlind}
            value={clamp(amount, min, max)}
            onChange={(e) => setAmount(Number(e.target.value))}
            aria-label="Bet amount"
          />
          <div className={styles.presets}>
            <button type="button" onClick={() => setAmount(targetFor(0.5))}>
              ½ Pot
            </button>
            <button type="button" onClick={() => setAmount(targetFor(0.75))}>
              ¾ Pot
            </button>
            <button type="button" onClick={() => setAmount(targetFor(1))}>
              Pot
            </button>
            <button type="button" onClick={() => setAmount(max)}>
              Max
            </button>
          </div>
        </div>
      ) : null}

      {view.selfBestHand ? (
        <div className={styles.bestHand}>Your hand: {view.selfBestHand}</div>
      ) : null}
    </div>
  )
}

/** Scrollable action history; auto-sticks to the newest line at the bottom. */
function ActionLog({
  entries,
  nameOf
}: {
  entries: PokerActionLogEntry[]
  nameOf: (id: string) => string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the newest entry (at the bottom) in view as the log grows, unless the
  // player has scrolled up to read further back.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [entries.length])

  return (
    <div ref={scrollRef} className={styles.log} aria-label="Action history">
      {entries.map((entry) => (
        <div key={entry.seq} className={styles.logLine}>
          {logText(entry, nameOf)}
        </div>
      ))}
    </div>
  )
}
