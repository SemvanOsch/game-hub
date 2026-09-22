import { useState } from 'react'
import type { UnoColor } from '@shared/uno/cards'
import type { UnoView, UnoPlayerView } from '@shared/uno/view'
import { Button } from '../../components/Button'
import type { GameUIProps } from '../ui'
import { UnoCard } from './UnoCard'
import styles from './UnoGame.module.css'

const COLOR_SWATCH: Record<UnoColor, string> = {
  red: '#e23b3f',
  yellow: '#f5b514',
  green: '#3fa34d',
  blue: '#2c7fe0'
}
const COLOR_LABEL: Record<UnoColor, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue'
}
const COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue']

/** The centre status line for the current situation. */
function statusMessage(view: UnoView, nameOf: (id: string) => string): string {
  if (view.status === 'finished') {
    return view.winnerId === view.selfId
      ? 'You win! 🎉'
      : view.winnerId
        ? `${nameOf(view.winnerId)} wins the round.`
        : 'Game over.'
  }
  if (view.status === 'choosing_color') {
    if (view.mustChooseColor) return 'Choose a colour for your Wild.'
    return `${nameOf(view.pendingColorPlayerId ?? '')} is choosing a colour…`
  }
  if (view.mustChooseColor) return 'Choose a colour for your Wild.'
  if (view.mustRespondToStack) {
    const kind = view.pendingDrawType === 'wild_draw_four' ? 'Wild Draw Four' : 'Draw Two'
    return `Stack a ${kind} or draw ${view.pendingDraw} cards.`
  }
  if (view.yourTurn) {
    if (view.drawnCardId) return 'Play the drawn card or pass.'
    return 'Your turn — play a card or draw.'
  }
  return `Waiting for ${nameOf(view.currentPlayerId)}…`
}

export function UnoGame({ room, view, sendAction, onLeave }: GameUIProps) {
  const state = view as UnoView
  const [armedUno, setArmedUno] = useState(false)
  const [pendingWild, setPendingWild] = useState<string | null>(null)

  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const connectedById = new Map(room.players.map((p) => [p.id, p.connected]))

  const self = state.players.find((p) => p.isSelf)
  // Opponents in seat order, rotated so play reads left-to-right from the local
  // player, matching the direction of play.
  const order = state.players
  const selfIndex = order.findIndex((p) => p.isSelf)
  const opponents =
    selfIndex >= 0 ? [...order.slice(selfIndex + 1), ...order.slice(0, selfIndex)] : order

  const playableSet = new Set(state.playableCardIds)
  const colorPickerOpen = state.mustChooseColor || pendingWild !== null

  const play = (cardId: string, chosenColor?: UnoColor) => {
    sendAction({ type: 'play_card', cardId, chosenColor, declareUno: armedUno })
    setArmedUno(false)
  }

  const onCardClick = (cardId: string, isWild: boolean) => {
    if (!state.yourTurn || !playableSet.has(cardId)) return
    if (isWild) {
      // Two-step colour flow: choose the colour first, then send the play with
      // the colour bundled so the server never sees a half-applied wild.
      setPendingWild(cardId)
      return
    }
    play(cardId)
  }

  const chooseColor = (color: UnoColor) => {
    if (pendingWild) {
      play(pendingWild, color)
      setPendingWild(null)
    } else if (state.mustChooseColor) {
      // A wild already sat on the pile server-side (e.g. no bundled colour);
      // complete it with a choose_color action.
      sendAction({ type: 'choose_color', color })
    }
  }

  const unoButton = () => {
    if (state.canCallUno) {
      // Already at one card — declare now (self-correct before being caught).
      sendAction({ type: 'call_uno' })
      setArmedUno(false)
    } else if (self && self.cardCount === 2 && state.yourTurn) {
      // About to play down to one — arm the declaration for the next play.
      setArmedUno((v) => !v)
    }
  }

  const finished = state.status === 'finished'
  const showUnoButton =
    !finished && !!self && (state.canCallUno || (self.cardCount === 2 && state.yourTurn))

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave game
        </button>
        <span className={styles.rules}>
          UNO · 2–8 players · {state.stacking ? 'Stacking on' : 'No stacking'} · Draw one, then play
          or pass · Call UNO at one card
        </span>
      </div>

      {/* Opponents */}
      <div className={styles.opponents}>
        {opponents.map((p) => (
          <OpponentSeat
            key={p.playerId}
            player={p}
            name={nameOf(p.playerId)}
            isTurn={
              (state.currentPlayerId === p.playerId && state.status === 'playing') ||
              state.pendingColorPlayerId === p.playerId
            }
            connected={connectedById.get(p.playerId) ?? true}
            catchable={state.catchableOpponentIds.includes(p.playerId)}
            onCatch={() => sendAction({ type: 'catch_uno', targetId: p.playerId })}
          />
        ))}
      </div>

      {/* Table: draw pile, discard, active colour + direction */}
      <div className={styles.table}>
        <div className={styles.pileGroup}>
          <button
            className={styles.drawPile}
            onClick={() => state.canDraw && sendAction({ type: 'draw_card' })}
            disabled={!state.canDraw}
            title={state.canDraw ? 'Draw a card' : 'Draw pile'}
          >
            <UnoCard back size="lg" />
            <span className={styles.pileCount}>{state.drawPileCount}</span>
          </button>
          <span className={styles.pileLabel}>Draw</span>
        </div>

        <div className={styles.centreInfo}>
          <div
            className={styles.colorDot}
            style={{ background: COLOR_SWATCH[state.activeColor] }}
            title={`Active colour: ${COLOR_LABEL[state.activeColor]}`}
            aria-label={`Active colour ${COLOR_LABEL[state.activeColor]}`}
          />
          <div className={styles.direction} aria-hidden>
            {state.direction === 1 ? '↻' : '↺'}
          </div>
        </div>

        <div className={styles.pileGroup}>
          <div className={styles.discardPile}>
            <UnoCard card={state.topCard} size="lg" animateIn />
          </div>
          <span className={styles.pileLabel}>Discard</span>
        </div>
      </div>

      {/* Status banner */}
      <div className={styles.banner} role="status" aria-live="polite">
        {statusMessage(state, nameOf)}
      </div>

      {/* Local player hand + controls */}
      {self ? (
        <section className={styles.self}>
          <div className={styles.selfHead}>
            <span className={styles.selfName}>
              {nameOf(self.playerId)} (You)
              {self.cardCount === 1 ? (
                <span
                  className={[styles.unoTag, self.saidUno ? styles.unoSafe : styles.unoExposed].join(
                    ' '
                  )}
                >
                  {self.saidUno ? 'UNO' : 'UNO?'}
                </span>
              ) : null}
            </span>
            <span className={styles.cardCount}>{self.cardCount} cards</span>
          </div>

          <div className={styles.hand}>
            {state.hand.map((card, i) => {
              const isWild = card.type === 'wild' || card.type === 'wild_draw_four'
              const playable = state.yourTurn && playableSet.has(card.id)
              return (
                <UnoCard
                  key={card.id}
                  card={card}
                  size="md"
                  className={styles.handCard}
                  playable={playable}
                  disabled={state.yourTurn && !playable}
                  onClick={() => onCardClick(card.id, isWild)}
                  animateIn={i >= state.hand.length - 1 && state.hand.length > 7}
                />
              )
            })}
          </div>

          <div className={styles.controls}>
            <Button
              size="lg"
              disabled={!state.canDraw}
              onClick={() => sendAction({ type: 'draw_card' })}
            >
              {state.mustRespondToStack ? `Draw ${state.pendingDraw}` : 'Draw card'}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={!state.canPass}
              onClick={() => sendAction({ type: 'pass' })}
            >
              Pass
            </Button>
            {showUnoButton ? (
              <Button
                size="lg"
                variant={armedUno || self.saidUno ? 'primary' : 'ghost'}
                className={armedUno ? styles.unoArmed : ''}
                onClick={unoButton}
              >
                {self.saidUno ? 'UNO called' : armedUno ? 'UNO armed ✓' : 'Call UNO!'}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Colour picker */}
      {colorPickerOpen ? (
        <div className={styles.pickerOverlay} role="dialog" aria-label="Choose a colour">
          <div className={styles.picker}>
            <h3>Choose a colour</h3>
            <div className={styles.swatches}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={styles.swatch}
                  style={{ background: COLOR_SWATCH[c] }}
                  onClick={() => chooseColor(c)}
                >
                  {COLOR_LABEL[c]}
                </button>
              ))}
            </div>
            {pendingWild ? (
              <button className={styles.cancelPick} onClick={() => setPendingWild(null)}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OpponentSeat({
  player,
  name,
  isTurn,
  connected,
  catchable,
  onCatch
}: {
  player: UnoPlayerView
  name: string
  isTurn: boolean
  connected: boolean
  catchable: boolean
  onCatch: () => void
}) {
  // Show a compact fan of card backs (capped), with the true count as a badge.
  const backs = Math.min(player.cardCount, 7)
  return (
    <div className={[styles.seat, isTurn ? styles.seatTurn : ''].filter(Boolean).join(' ')}>
      <div className={styles.seatHead}>
        <span className={styles.seatName}>
          {name}
          {!connected ? <span className={styles.offline}> (offline)</span> : null}
        </span>
        <span className={styles.seatCount}>{player.cardCount}</span>
      </div>
      <div className={styles.seatCards}>
        {Array.from({ length: backs }).map((_, i) => (
          <UnoCard key={i} back size="sm" className={styles.seatBack} />
        ))}
        {player.cardCount === 0 ? <span className={styles.empty}>—</span> : null}
      </div>
      <div className={styles.seatFoot}>
        {player.cardCount === 1 ? (
          <span
            className={[styles.unoTag, player.saidUno ? styles.unoSafe : styles.unoExposed].join(
              ' '
            )}
          >
            {player.saidUno ? 'UNO' : 'UNO?'}
          </span>
        ) : null}
        {catchable ? (
          <button className={styles.catchBtn} onClick={onCatch} title="Catch a missed UNO call">
            Catch!
          </button>
        ) : null}
      </div>
    </div>
  )
}
