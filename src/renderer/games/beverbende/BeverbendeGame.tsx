import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  BeverbendePlayerView,
  BeverbendeView,
  CardSlot,
  PendingView
} from '@shared/beverbende/view'
import { Button } from '../../components/Button'
import type { GameUIProps } from '../ui'
import { BeverbendeCard } from './BeverbendeCard'
import styles from './BeverbendeGame.module.css'

/** Local interaction mode layered on top of the server's authoritative pending state. */
type UiMode = 'idle' | 'takeDiscard' | 'replace' | 'peek' | 'swapOwn' | 'swapTarget'

const SPECIAL_NAME: Record<string, string> = {
  peek: 'Peek',
  swap: 'Swap',
  drawTwo: 'Draw Two'
}

export function BeverbendeGame({ room, view, selfId, sendAction, onLeave }: GameUIProps) {
  const state = view as BeverbendeView
  const [mode, setMode] = useState<UiMode>('idle')
  const [swapOwnPos, setSwapOwnPos] = useState<number | null>(null)

  const nameById = useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players])
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const connectedById = useMemo(
    () => new Map(room.players.map((p) => [p.id, p.connected])),
    [room.players]
  )

  const self = state.players.find((p) => p.isSelf)
  const selfIndex = state.players.findIndex((p) => p.isSelf)
  const opponents =
    selfIndex >= 0
      ? [...state.players.slice(selfIndex + 1), ...state.players.slice(0, selfIndex)]
      : state.players

  // A fresh server view supersedes any local selection; re-derive forced modes.
  useEffect(() => {
    const pending = state.pending
    if (state.yourTurn && pending?.kind === 'peek') setMode('peek')
    else if (state.yourTurn && pending?.kind === 'swap') setMode('swapOwn')
    else setMode('idle')
    setSwapOwnPos(null)
  }, [view, state.pending, state.yourTurn])

  // Clock calibration for a synchronized countdown (mirrors Skip-Bo / Zip).
  const offsetRef = useRef(0)
  useEffect(() => {
    offsetRef.current = state.serverNow - Date.now()
  }, [state.serverNow])
  const serverNow = () => Date.now() + offsetRef.current

  const [, setTick] = useState(0)
  useEffect(() => {
    if (state.status === 'finished') return
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [state.status])

  const secondsLeft = Math.max(0, Math.ceil((state.deadline - serverNow()) / 1000))

  // Explicit, button-controlled reveals — no timed window. The local player's cards
  // are face-down during play; the only face-up reveals are the two outer cards
  // during the reveal phase (until they press Ready) and a single just-peeked card
  // (until they press Hide). Replacing a card or taking the discard never reveals the
  // hand — the player already saw that card, so only a "known" marker is added.
  const [peekReveal, setPeekReveal] = useState<number | null>(null)
  // A new round clears any lingering peek reveal.
  useEffect(() => {
    setPeekReveal(null)
  }, [state.round])
  const selfReady = self?.ready ?? false
  const revealAll = state.status === 'roundOver' || state.status === 'finished'
  // Whether a given own slot should currently show its face.
  const showSelfFace = (slot: CardSlot, index: number) => {
    if (revealAll) return true
    if (state.status === 'reveal') return slot.known && !selfReady
    if (state.status === 'playing') return slot.known && index === peekReveal
    return false
  }
  // A just-peeked card awaiting the player's Hide press.
  const peekShowing =
    state.status === 'playing' && peekReveal !== null && !!self?.cards[peekReveal]?.known

  // --- move animations -----------------------------------------------------
  const reducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

  // Draw pile "lift" whenever a card leaves it.
  const drawPileRef = useRef<HTMLButtonElement>(null)
  const prevDrawCount = useRef(state.drawPileCount)
  useEffect(() => {
    const el = drawPileRef.current
    if (el && state.drawPileCount < prevDrawCount.current && !reducedMotion()) {
      el.animate(
        [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-10px) scale(1.06)' },
          { transform: 'translateY(0) scale(1)' }
        ],
        { duration: 320, easing: 'ease-out' }
      )
    }
    prevDrawCount.current = state.drawPileCount
  }, [state.drawPileCount])

  // Flash the local player's own card slot that they just acted on.
  const [flashSlot, setFlashSlot] = useState<number | null>(null)
  const pendingFlashSlot = useRef<number | null>(null)
  useEffect(() => {
    if (pendingFlashSlot.current === null) return
    setFlashSlot(pendingFlashSlot.current)
    pendingFlashSlot.current = null
    const t = window.setTimeout(() => setFlashSlot(null), 750)
    return () => window.clearTimeout(t)
    // Re-run when a new server view arrives (the move has been applied).
  }, [view])

  // A DOM element per card slot ("<playerId>:<position>"), for the swap animation.
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const registerCard = (playerId: string, position: number, el: HTMLElement | null) => {
    const key = `${playerId}:${position}`
    if (el) cardRefs.current.set(key, el)
    else cardRefs.current.delete(key)
  }
  // When a swap happens, fly the two exchanged cards across the table from each
  // other's old spot into place, so it is clear which two cards were swapped.
  useEffect(() => {
    const sw = state.lastSwap
    if (!sw || reducedMotion()) return
    const a = cardRefs.current.get(`${sw.aId}:${sw.aPos}`)
    const b = cardRefs.current.get(`${sw.bId}:${sw.bPos}`)
    if (!a || !b) return
    const ra = a.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    const dx = rb.left + rb.width / 2 - (ra.left + ra.width / 2)
    const dy = rb.top + rb.height / 2 - (ra.top + ra.height / 2)
    // Each card now sits where the OTHER card used to be, so it flies in from there.
    const fly = (el: HTMLElement, fromX: number, fromY: number) => {
      el.style.zIndex = '40'
      el.style.position = 'relative'
      const anim = el.animate(
        [
          { transform: `translate(${fromX}px, ${fromY}px) scale(1.12)`, boxShadow: '0 10px 26px rgba(0,0,0,0.55)' },
          { transform: 'translate(0, 0) scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' }
        ],
        { duration: 620, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)' }
      )
      anim.onfinish = () => {
        el.style.zIndex = ''
        el.style.position = ''
      }
    }
    fly(a, dx, dy)
    fly(b, -dx, -dy)
  }, [view])

  // --- action senders ------------------------------------------------------
  const send = sendAction
  const clickOwnCard = (position: number) => {
    if (!state.yourTurn) return
    switch (mode) {
      case 'takeDiscard':
        pendingFlashSlot.current = position
        send({ type: 'takeDiscard', position })
        break
      case 'replace':
        pendingFlashSlot.current = position
        send({ type: 'replace', position })
        break
      case 'peek':
        send({ type: 'peek', position })
        // Reveal only this card (until the player presses Hide).
        setPeekReveal(position)
        break
      case 'swapOwn':
        setSwapOwnPos(position)
        setMode('swapTarget')
        break
      case 'swapTarget':
        // Re-picking your own card during target selection.
        setSwapOwnPos(position)
        break
      default:
        break
    }
  }
  const clickOpponentCard = (targetId: string, targetPosition: number) => {
    if (!state.yourTurn || mode !== 'swapTarget' || swapOwnPos === null) return
    pendingFlashSlot.current = swapOwnPos // flash the card you swapped away
    send({ type: 'swap', ownPosition: swapOwnPos, targetId, targetPosition })
  }

  const canTakeDiscard =
    state.yourTurn && !state.pending && state.discardTop?.type === 'number'
  const canKnock =
    state.yourTurn && !state.pending && !state.roundEndingPlayerId && state.finalTurnsLeft === null

  const pending = state.yourTurn ? state.pending : null

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave game
        </button>
        <span className={styles.rules}>
          Beverbende · Round {state.round}/{state.totalRounds} · Lowest score wins · Remember your
          cards
        </span>
      </div>

      {/* Opponents */}
      <div className={styles.opponents}>
        {opponents.map((p) => (
          <OpponentSeat
            key={p.playerId}
            player={p}
            name={nameOf(p.playerId)}
            isTurn={state.currentPlayerId === p.playerId && state.status === 'playing'}
            connected={connectedById.get(p.playerId) ?? true}
            knocked={state.roundEndingPlayerId === p.playerId}
            swapTargetMode={mode === 'swapTarget'}
            onCardClick={(pos) => clickOpponentCard(p.playerId, pos)}
            registerCard={registerCard}
          />
        ))}
      </div>

      {/* Centre: draw pile + discard pile */}
      <div className={styles.tableWrap}>
        <div className={styles.pileArea}>
          <button
            ref={drawPileRef}
            className={[styles.pile, state.yourTurn && !state.pending ? styles.pileHot : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => state.yourTurn && !state.pending && send({ type: 'draw' })}
            disabled={!state.yourTurn || !!state.pending}
            title="Draw the top card of the draw pile"
          >
            {state.drawPileCount > 0 ? (
              <BeverbendeCard back size="md" />
            ) : (
              <div className={styles.pileEmpty}>Empty</div>
            )}
            <span className={styles.pileCount}>{state.drawPileCount}</span>
          </button>
          <span className={styles.pileLabel}>Draw</span>
        </div>

        <div className={styles.pileArea}>
          <button
            className={[styles.pile, canTakeDiscard ? styles.pileHot : ''].filter(Boolean).join(' ')}
            onClick={() => canTakeDiscard && setMode('takeDiscard')}
            disabled={!canTakeDiscard}
            title={
              state.discardTop?.type === 'number'
                ? 'Take this card into one of your cards'
                : 'Power cards cannot be taken from the discard'
            }
          >
            {state.discardTop ? (
              <BeverbendeCard
                key={state.discardTop.id}
                card={state.discardTop}
                size="md"
                className={styles.discardIn}
              />
            ) : (
              <div className={styles.pileEmpty}>—</div>
            )}
            <span className={styles.pileCount}>{state.discardCount}</span>
          </button>
          <span className={styles.pileLabel}>Discard</span>
        </div>
      </div>

      {/* Animated event toast — re-plays its slide-in on every new move. */}
      {state.lastEvent ? (
        <div className={styles.toastRow}>
          <div key={state.serverNow} className={styles.toast}>
            {state.lastActorId ? (
              <span className={styles.toastActor}>{nameOf(state.lastActorId)}</span>
            ) : null}
            <span className={styles.toastText}>{state.lastEvent}</span>
          </div>
        </div>
      ) : null}

      {/* Status banner */}
      <div className={styles.banner} role="status" aria-live="polite">
        <span className={styles.bannerMsg}>{statusMessage(state, mode, nameOf, swapOwnPos)}</span>
        {state.roundEndingPlayerId ? (
          <span className={styles.finalTag}>
            Last round · {nameOf(state.roundEndingPlayerId)} knocked
          </span>
        ) : null}
        {state.status === 'playing' ? (
          <span className={[styles.timer, secondsLeft <= 10 ? styles.timerLow : ''].join(' ')}>
            ⏱ {secondsLeft}s
          </span>
        ) : null}
      </div>

      {/* Pending drawn card / action prompt */}
      {pending ? (
        <PendingPanel
          key={pending.kind === 'decide' ? pending.card.id : pending.kind}
          pending={pending}
          onReplace={() => setMode('replace')}
          onDiscard={() => send({ type: 'discardDrawn' })}
          onUse={() => send({ type: 'useSpecial' })}
          mode={mode}
        />
      ) : null}

      {/* Self area */}
      {self ? (
        <section
          className={[
            styles.self,
            state.yourTurn ? styles.selfActive : '',
            state.status === 'reveal' ? styles.selfRaised : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className={styles.selfHead}>
            <span className={styles.selfName}>
              {nameOf(selfId)} (You){state.roundEndingPlayerId === selfId ? ' · knocked' : ''}
            </span>
            <span className={styles.selfScore}>Total: {self.cumulativeScore}</span>
          </div>
          <div className={styles.selfCards}>
            {self.cards.map((slot, i) => (
              <SelfCard
                key={i}
                slot={slot}
                position={i}
                faceUp={showSelfFace(slot, i)}
                flash={flashSlot === i}
                interactive={selfCardInteractive(mode)}
                selected={mode === 'swapTarget' && swapOwnPos === i}
                onClick={() => clickOwnCard(i)}
                refCb={(el) => registerCard(selfId, i, el)}
              />
            ))}
          </div>

          {/* Peek reveal — shown until the player presses Hide (no timer). */}
          {peekShowing ? (
            <div className={styles.controls}>
              <span className={styles.peekHint}>
                You peeked at card {(peekReveal ?? 0) + 1}. Remember it, then hide.
              </span>
              <Button size="sm" onClick={() => setPeekReveal(null)}>
                Hide card
              </Button>
            </div>
          ) : null}

          {/* Idle turn controls */}
          {state.yourTurn && !state.pending && mode === 'idle' ? (
            <div className={styles.controls}>
              <Button size="sm" onClick={() => send({ type: 'draw' })}>
                Draw a card
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canTakeDiscard}
                onClick={() => setMode('takeDiscard')}
              >
                Take discard
              </Button>
              <Button size="sm" variant="ghost" disabled={!canKnock} onClick={() => send({ type: 'knock' })}>
                Knock (last round)
              </Button>
            </div>
          ) : null}

          {/* Cancel affordance while picking a position (client-side only). */}
          {state.yourTurn && (mode === 'takeDiscard' || mode === 'swapTarget') ? (
            <div className={styles.controls}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMode(state.pending?.kind === 'swap' ? 'swapOwn' : 'idle')
                  setSwapOwnPos(null)
                }}
              >
                Cancel
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Reveal (memorise) overlay */}
      {state.status === 'reveal' ? (
        <RevealOverlay
          ready={self?.ready ?? false}
          waiting={state.players.filter((p) => !p.ready).map((p) => nameOf(p.playerId))}
          onReady={() => send({ type: 'ready' })}
        />
      ) : null}

      {/* Between-rounds scoreboard */}
      {state.status === 'roundOver' && state.roundScores ? (
        <RoundOverOverlay
          players={state.players}
          roundScores={state.roundScores}
          nameOf={nameOf}
          round={state.round}
          totalRounds={state.totalRounds}
          seconds={secondsLeft}
        />
      ) : null}
    </div>
  )
}

function selfCardInteractive(mode: UiMode): boolean {
  return mode === 'takeDiscard' || mode === 'replace' || mode === 'peek' || mode === 'swapOwn' || mode === 'swapTarget'
}

function statusMessage(
  state: BeverbendeView,
  mode: UiMode,
  nameOf: (id: string) => string,
  swapOwnPos: number | null
): string {
  if (state.status === 'reveal') return 'Memorise your two face-up cards…'
  if (state.status === 'roundOver') return `Round ${state.round} complete.`
  if (!state.yourTurn) return `Waiting for ${nameOf(state.currentPlayerId)}…`
  const pending = state.pending
  if (pending?.kind === 'peek') return 'Peek — tap one of your cards to look at it.'
  if (pending?.kind === 'swap') {
    return swapOwnPos === null
      ? 'Swap — tap one of your cards first.'
      : "Swap — now tap an opponent's card to trade."
  }
  if (pending?.kind === 'decide') {
    return pending.canUse
      ? `You drew ${SPECIAL_NAME[pending.card.type] ?? 'a card'}. Use it or discard it.`
      : `You drew a ${'value' in pending.card ? pending.card.value : ''}. Replace a card or discard it.`
  }
  if (mode === 'takeDiscard') return 'Tap one of your cards to swap the discard into it.'
  if (mode === 'replace') return 'Tap the card you want to replace.'
  return 'Your turn — draw a card, take the discard, or knock.'
}

// --- Pending action panel ---------------------------------------------------

function PendingPanel({
  pending,
  onReplace,
  onDiscard,
  onUse,
  mode
}: {
  pending: PendingView
  onReplace: () => void
  onDiscard: () => void
  onUse: () => void
  mode: UiMode
}) {
  if (pending.kind !== 'decide') {
    return (
      <div className={[styles.pendingPanel, styles.pendingIn].join(' ')}>
        <span className={styles.pendingHint}>
          {pending.kind === 'peek'
            ? 'Choose one of your cards to peek at.'
            : 'Choose your card, then an opponent’s card to swap.'}
        </span>
      </div>
    )
  }
  return (
    <div className={[styles.pendingPanel, styles.pendingIn].join(' ')}>
      <div className={styles.pendingCardWrap}>
        <span className={styles.pendingLabel}>
          {pending.drawTwoStage === 2 ? 'Second card (must resolve)' : 'You drew'}
        </span>
        <BeverbendeCard card={pending.card} size="lg" />
      </div>
      <div className={styles.pendingActions}>
        {pending.canUse ? (
          <Button size="sm" onClick={onUse}>
            Use {SPECIAL_NAME[pending.card.type] ?? 'card'}
          </Button>
        ) : (
          <Button size="sm" variant={mode === 'replace' ? 'primary' : 'secondary'} onClick={onReplace}>
            Replace a card
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  )
}

// --- Self card --------------------------------------------------------------

function SelfCard({
  slot,
  position,
  faceUp,
  flash,
  interactive,
  selected,
  onClick,
  refCb
}: {
  slot: CardSlot
  position: number
  /** Whether to render the card's face right now (reveal window, flash, scoring). */
  faceUp: boolean
  /** Briefly highlight this slot (a card just moved into/out of it). */
  flash: boolean
  interactive: boolean
  selected: boolean
  onClick: () => void
  /** Registers the card element for the cross-table swap animation. */
  refCb?: (el: HTMLElement | null) => void
}) {
  // Show the face only during a reveal/flash; otherwise a face-down card that still
  // marks whether the player has learned it (a memory aid without leaking the value).
  const showFace = faceUp && !!slot.card
  return (
    <div className={[styles.selfCardCell, flash ? styles.slotFlash : ''].filter(Boolean).join(' ')}>
      <div className={styles.cardHolder} ref={refCb}>
        {showFace ? (
          <BeverbendeCard
            card={slot.card!}
            size="lg"
            selected={selected}
            playable={interactive}
            onClick={interactive ? onClick : undefined}
          />
        ) : interactive ? (
          <button
            className={[styles.hiddenCard, selected ? styles.hiddenSel : '', slot.known ? styles.knownCard : '']
              .filter(Boolean)
              .join(' ')}
            onClick={onClick}
          >
            <BeverbendeCard back size="lg" />
            {slot.known ? <span className={styles.knownDot} aria-label="You know this card" /> : null}
          </button>
        ) : (
          <div className={[styles.hiddenCard, slot.known ? styles.knownCard : ''].filter(Boolean).join(' ')}>
            <BeverbendeCard back size="lg" />
            {slot.known ? <span className={styles.knownDot} aria-label="You know this card" /> : null}
          </div>
        )}
      </div>
      <span className={styles.posLabel}>{position + 1}</span>
    </div>
  )
}

// --- Opponent seat ----------------------------------------------------------

function OpponentSeat({
  player,
  name,
  isTurn,
  connected,
  knocked,
  swapTargetMode,
  onCardClick,
  registerCard
}: {
  player: BeverbendePlayerView
  name: string
  isTurn: boolean
  connected: boolean
  knocked: boolean
  swapTargetMode: boolean
  onCardClick: (position: number) => void
  registerCard: (playerId: string, position: number, el: HTMLElement | null) => void
}) {
  return (
    <div className={[styles.seat, isTurn ? styles.seatTurn : ''].filter(Boolean).join(' ')}>
      <div className={styles.seatHead}>
        <span className={styles.seatName}>
          {name}
          {!connected ? <span className={styles.offline}> (offline)</span> : null}
        </span>
        <span className={styles.seatScore}>{player.cumulativeScore}</span>
        {isTurn ? <span className={styles.seatTurnTag}>Turn</span> : null}
        {knocked ? <span className={styles.seatKnock}>Knocked</span> : null}
      </div>
      <div className={styles.seatCards}>
        {player.cards.map((slot, i) => (
          <span
            key={i}
            className={styles.oppCardHolder}
            ref={(el) => registerCard(player.playerId, i, el)}
          >
            {slot.card ? (
              <BeverbendeCard card={slot.card} size="sm" />
            ) : swapTargetMode ? (
              <button className={styles.seatCardBtn} onClick={() => onCardClick(i)} title="Swap with this card">
                <BeverbendeCard back size="sm" />
              </button>
            ) : (
              <BeverbendeCard back size="sm" />
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

// --- Overlays ---------------------------------------------------------------

function RevealOverlay({
  ready,
  waiting,
  onReady
}: {
  ready: boolean
  waiting: string[]
  onReady: () => void
}) {
  return (
    <div className={styles.revealOverlay}>
      <div className={styles.overlayPanel}>
        <h2 className={styles.overlayTitle}>Memorise your cards</h2>
        <p className={styles.overlayText}>
          Your two outer cards (positions 1 and 4) are shown below. Take your time — they stay up
          until you press the button.
        </p>
        {ready ? (
          <p className={styles.overlayText}>
            Waiting for {waiting.length ? waiting.join(', ') : 'other players'} to be ready…
          </p>
        ) : (
          <Button size="lg" onClick={onReady}>
            Got it — hide my cards
          </Button>
        )}
      </div>
    </div>
  )
}

function RoundOverOverlay({
  players,
  roundScores,
  nameOf,
  round,
  totalRounds,
  seconds
}: {
  players: BeverbendePlayerView[]
  roundScores: Record<string, number>
  nameOf: (id: string) => string
  round: number
  totalRounds: number
  seconds: number
}) {
  const rows = [...players].sort((a, b) => a.cumulativeScore - b.cumulativeScore)
  return (
    <div className={styles.overlay}>
      <div className={styles.overlayPanel}>
        <h2 className={styles.overlayTitle}>Round {round} scored</h2>
        <div className={styles.scoreTable}>
          <div className={styles.scoreHead}>
            <span>Player</span>
            <span>This round</span>
            <span>Total</span>
          </div>
          {rows.map((p) => (
            <div key={p.playerId} className={styles.scoreRow}>
              <span>
                {nameOf(p.playerId)}
                {p.isSelf ? ' (You)' : ''}
              </span>
              <span>+{roundScores[p.playerId] ?? 0}</span>
              <span className={styles.scoreTotal}>{p.cumulativeScore}</span>
            </div>
          ))}
        </div>
        <p className={styles.overlayFine}>
          {round >= totalRounds ? 'Final scores!' : `Next round in ${seconds}s…`}
        </p>
      </div>
    </div>
  )
}
