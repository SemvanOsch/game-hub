import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cardSatisfies, type SkipBoCard as SkipBoCardModel } from '@shared/skipbo/cards'
import type { PlaySource } from '@shared/skipbo/engine'
import type { SkipBoPlayerView, SkipBoView } from '@shared/skipbo/view'
import { Button } from '../../components/Button'
import type { GameUIProps } from '../ui'
import { SkipBoCard } from './SkipBoCard'
import styles from './SkipBoGame.module.css'

/** The concrete card a play source currently refers to, from the local view. */
function sourceCard(view: SkipBoView, self: SkipBoPlayerView, src: PlaySource): SkipBoCardModel | null {
  switch (src.source) {
    case 'stock':
      return self.stockTop
    case 'hand':
      return view.hand.find((c) => c.id === src.cardId) ?? null
    case 'discard':
      return self.discardTops[src.discardIndex] ?? null
  }
}

/** Whether two play sources refer to the same selection. */
function sameSource(a: PlaySource | null, b: PlaySource): boolean {
  if (!a || a.source !== b.source) return false
  if (a.source === 'hand' && b.source === 'hand') return a.cardId === b.cardId
  if (a.source === 'discard' && b.source === 'discard') return a.discardIndex === b.discardIndex
  return a.source === b.source
}

function statusMessage(view: SkipBoView, nameOf: (id: string) => string, selected: boolean): string {
  if (view.status === 'finished') {
    return view.winnerId === view.selfId
      ? 'You win! 🎉'
      : view.winnerId
        ? `${nameOf(view.winnerId)} wins.`
        : 'Game over.'
  }
  if (!view.yourTurn) return `Waiting for ${nameOf(view.currentPlayerId)}…`
  if (selected) return 'Tap a building pile to play — or a discard pile (hand cards only) to end your turn.'
  return 'Your turn — play from stock, hand or a discard, then discard one card to end.'
}

export function SkipBoGame({ room, view, sendAction, onLeave }: GameUIProps) {
  const state = view as SkipBoView
  const [selected, setSelected] = useState<PlaySource | null>(null)

  const nameById = useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players])
  const nameOf = (id: string) => nameById.get(id) ?? 'Player'
  const connectedById = useMemo(
    () => new Map(room.players.map((p) => [p.id, p.connected])),
    [room.players]
  )

  const self = state.players.find((p) => p.isSelf)
  const order = state.players
  const selfIndex = order.findIndex((p) => p.isSelf)
  const opponents =
    selfIndex >= 0 ? [...order.slice(selfIndex + 1), ...order.slice(0, selfIndex)] : order

  // Clear any stale selection whenever a new server view arrives.
  useEffect(() => {
    setSelected(null)
  }, [view])

  // Clock calibration for a synchronized turn countdown (mirrors Zip).
  const offsetRef = useRef(0)
  useEffect(() => {
    offsetRef.current = state.serverNow - Date.now()
  }, [state.serverNow])
  const serverNow = () => Date.now() + offsetRef.current

  const [, setTick] = useState(0)
  useEffect(() => {
    if (state.status !== 'playing') return
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [state.status])

  // Deal animation: fly newly drawn cards from the draw pile into the hand.
  const drawPileRef = useRef<HTMLDivElement>(null)
  const handCardRefs = useRef(new Map<string, HTMLElement>())
  const prevHandIds = useRef<Set<string>>(new Set())
  useLayoutEffect(() => {
    const currentIds = new Set(state.hand.map((c) => c.id))
    const newIds = [...currentIds].filter((id) => !prevHandIds.current.has(id))
    const hadHand = prevHandIds.current.size > 0
    prevHandIds.current = currentIds
    const pile = drawPileRef.current
    if (!pile || newIds.length === 0) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const pileRect = pile.getBoundingClientRect()
    newIds.forEach((id, i) => {
      const el = handCardRefs.current.get(id)
      if (!el) return
      const r = el.getBoundingClientRect()
      const dx = pileRect.left + pileRect.width / 2 - (r.left + r.width / 2)
      const dy = pileRect.top + pileRect.height / 2 - (r.top + r.height / 2)
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.7) rotate(-5deg)`, opacity: 0 },
          { transform: 'translate(0, 0) scale(1) rotate(0)', opacity: 1 }
        ],
        {
          // Stagger only when several cards arrive at once (a fresh hand).
          duration: 330,
          delay: hadHand ? i * 45 : i * 80,
          easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)',
          fill: 'backwards'
        }
      )
    })
  }, [state.hand])

  const secondsLeft = Math.max(0, Math.ceil((state.turnDeadline - serverNow()) / 1000))
  const lowTime = state.yourTurn && secondsLeft <= 10

  const selectedCard = self && selected ? sourceCard(state, self, selected) : null

  // Which building piles the selected card can legally go on (UX hint only).
  const legalBuildings = useMemo(() => {
    if (!selectedCard) return new Set<number>()
    const s = new Set<number>()
    state.buildingPiles.forEach((pile, i) => {
      if (cardSatisfies(selectedCard, pile.required)) s.add(i)
    })
    return s
  }, [selectedCard, state.buildingPiles])

  // A stock/discard source is only useful for building; dim it when it has no
  // legal building target. Hand cards stay selectable (they can be discarded).
  const hasBuildingPlay = (card: SkipBoCardModel | null): boolean =>
    !!card && state.buildingPiles.some((p) => cardSatisfies(card, p.required))

  const trySelect = (src: PlaySource) => {
    if (!state.yourTurn) return
    setSelected((prev) => (sameSource(prev, src) ? null : src))
  }

  const clickBuilding = (i: number) => {
    if (!state.yourTurn || !selected) return
    if (!legalBuildings.has(i)) return
    sendAction({ type: 'play', from: selected, buildingIndex: i })
    setSelected(null)
  }

  const clickDiscardPile = (i: number) => {
    if (!state.yourTurn) return
    // A selected HAND card discards here (ends the turn).
    if (selected && selected.source === 'hand') {
      sendAction({ type: 'discard', cardId: selected.cardId, discardIndex: i })
      setSelected(null)
      return
    }
    // Otherwise, selecting the top of this discard pile to play it.
    if (self && self.discardTops[i]) trySelect({ source: 'discard', discardIndex: i })
  }

  const finished = state.status === 'finished'
  const discardMode = !!selected && selected.source === 'hand'

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave game
        </button>
        <span className={styles.rules}>
          Skip-Bo · {state.gameLength === 'short' ? 'Short game' : 'Long game'} · Empty your stockpile
          first · Build 1→12 · Discard to end your turn
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
          />
        ))}
      </div>

      {/* Centre: draw pile + building piles */}
      <div className={styles.tableWrap}>
        <div className={styles.tableRow}>
          {/* Draw pile — cards are visually dealt from here into the hand. */}
          <div className={styles.drawArea}>
            <div
              className={styles.drawPile}
              ref={drawPileRef}
              title="Draw pile — cards are dealt from here"
            >
              {state.drawPileCount > 0 ? (
                <>
                  <SkipBoCard back size="md" className={styles.drawBack3} />
                  <SkipBoCard back size="md" className={styles.drawBack2} />
                  <SkipBoCard back size="md" className={styles.drawBackTop} />
                </>
              ) : (
                <div className={styles.drawEmpty}>Empty</div>
              )}
              <span className={styles.drawCount}>{state.drawPileCount}</span>
            </div>
            <span className={styles.drawLabel}>
              Draw{state.completedCount > 0 ? ` · ${state.completedCount}↻` : ''}
            </span>
          </div>

          <div className={styles.buildingRow}>
            {state.buildingPiles.map((pile, i) => {
              const legal = legalBuildings.has(i)
              return (
                <button
                  key={i}
                  className={[
                    styles.building,
                    legal ? styles.buildingLegal : '',
                    selected && !legal ? styles.buildingDim : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => clickBuilding(i)}
                  disabled={!selected || !legal}
                  title={
                    pile.topCard ? `Building pile — needs ${pile.required}` : 'Empty pile — needs 1'
                  }
                >
                  {pile.topCard ? (
                    <SkipBoCard card={pile.topCard} size="md" />
                  ) : (
                    <div className={styles.buildingEmpty}>
                      <span className={styles.buildingNeed}>{pile.required}</span>
                    </div>
                  )}
                  <span className={styles.buildingCount}>{pile.count}/12</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Status + timer */}
      <div className={styles.banner} role="status" aria-live="polite">
        <span className={styles.turnBadge}>Turn {state.turnNumber}</span>
        <span className={styles.bannerMsg}>{statusMessage(state, nameOf, !!selected)}</span>
        {state.lastEvent ? <span className={styles.lastEvent}>· {state.lastEvent}</span> : null}
        {!finished ? (
          <span className={[styles.timer, lowTime ? styles.timerLow : ''].join(' ')}>
            ⏱ {secondsLeft}s
          </span>
        ) : null}
      </div>

      {/* Self area */}
      {self ? (
        <section className={[styles.self, state.yourTurn ? styles.selfActive : ''].join(' ')}>
          <div className={styles.selfTop}>
            {/* Stock */}
            <div className={styles.stockArea}>
              <span className={styles.areaLabel}>Your stock</span>
              <button
                className={[
                  styles.stockCard,
                  self.stockTop && sameSource(selected, { source: 'stock' }) ? styles.stockSel : '',
                  self.stockTop && state.yourTurn && hasBuildingPlay(self.stockTop)
                    ? styles.stockHot
                    : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => self.stockTop && trySelect({ source: 'stock' })}
                disabled={!self.stockTop || !state.yourTurn}
                title="Play the top of your stockpile"
              >
                {self.stockTop ? (
                  <SkipBoCard
                    card={self.stockTop}
                    size="md"
                    selected={sameSource(selected, { source: 'stock' })}
                  />
                ) : (
                  <div className={styles.stockEmpty}>—</div>
                )}
                <span className={styles.stockCount}>{self.stockCount} left</span>
              </button>
            </div>

            {/* Discard piles */}
            <div className={styles.discardArea}>
              <span className={styles.areaLabel}>
                Your discard piles {discardMode ? '· tap one to end your turn' : ''}
              </span>
              <div className={styles.discardRow}>
                {self.discardTops.map((top, i) => (
                  <button
                    key={i}
                    className={[
                      styles.discardPile,
                      discardMode ? styles.discardDrop : '',
                      !discardMode && top && sameSource(selected, { source: 'discard', discardIndex: i })
                        ? styles.discardSel
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => clickDiscardPile(i)}
                    disabled={!state.yourTurn || (!discardMode && !top)}
                    title={discardMode ? 'Discard here to end your turn' : 'Play the top card'}
                  >
                    {top ? (
                      <SkipBoCard
                        card={top}
                        size="sm"
                        selected={
                          !discardMode && sameSource(selected, { source: 'discard', discardIndex: i })
                        }
                      />
                    ) : (
                      <div className={styles.discardEmpty}>{i + 1}</div>
                    )}
                    <span className={styles.discardCount}>{self.discardCounts[i]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Hand */}
          <div className={styles.handArea}>
            <span className={styles.areaLabel}>Your hand ({self.handCount})</span>
            <div className={styles.hand}>
              {state.hand.length === 0 ? (
                <span className={styles.handEmpty}>No cards in hand.</span>
              ) : (
                state.hand.map((card) => {
                  const sel = sameSource(selected, { source: 'hand', cardId: card.id })
                  return (
                    <span
                      key={card.id}
                      className={styles.handCardWrap}
                      ref={(el) => {
                        if (el) handCardRefs.current.set(card.id, el)
                        else handCardRefs.current.delete(card.id)
                      }}
                    >
                      <SkipBoCard
                        card={card}
                        size="md"
                        className={styles.handCard}
                        selected={sel}
                        playable={state.yourTurn && !selected && hasBuildingPlay(card)}
                        disabled={!state.yourTurn}
                        onClick={() => trySelect({ source: 'hand', cardId: card.id })}
                      />
                    </span>
                  )
                })
              )}
            </div>
            {selected ? (
              <div className={styles.controls}>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                  Deselect
                </Button>
                <span className={styles.hint}>
                  {selectedCard
                    ? selectedCard.type === 'skipbo'
                      ? 'Skip-Bo wild — takes whatever value a pile needs.'
                      : `Selected a ${selectedCard.value}.`
                    : ''}
                </span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function OpponentSeat({
  player,
  name,
  isTurn,
  connected
}: {
  player: SkipBoPlayerView
  name: string
  isTurn: boolean
  connected: boolean
}) {
  const backs = Math.min(player.handCount, 5)
  return (
    <div className={[styles.seat, isTurn ? styles.seatTurn : ''].filter(Boolean).join(' ')}>
      <div className={styles.seatHead}>
        <span className={styles.seatName}>
          {name}
          {!connected ? <span className={styles.offline}> (offline)</span> : null}
        </span>
        {isTurn ? <span className={styles.seatTurnTag}>Turn</span> : null}
      </div>
      <div className={styles.seatBody}>
        <div className={styles.seatStock} title="Opponent stockpile (top card visible)">
          {player.stockTop ? (
            <SkipBoCard card={player.stockTop} size="xs" />
          ) : (
            <div className={styles.seatStockEmpty}>—</div>
          )}
          <span className={styles.seatStockCount}>{player.stockCount}</span>
        </div>
        <div className={styles.seatHand} title={`${player.handCount} cards in hand`}>
          {Array.from({ length: backs }).map((_, i) => (
            <SkipBoCard key={i} back size="xs" className={styles.seatBack} />
          ))}
          {player.handCount === 0 ? <span className={styles.seatEmpty}>0</span> : null}
        </div>
      </div>
      <div className={styles.seatDiscards} title="Opponent discard-pile tops">
        {player.discardTops.map((top, i) =>
          top ? (
            <SkipBoCard key={i} card={top} size="xs" />
          ) : (
            <div key={i} className={styles.seatDiscEmpty}>
              {i + 1}
            </div>
          )
        )}
      </div>
    </div>
  )
}
