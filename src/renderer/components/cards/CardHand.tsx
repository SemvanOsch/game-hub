import { useEffect, useRef } from 'react'
import type { CardOrHidden } from '@shared/blackjack/cards'
import { isHidden } from '@shared/blackjack/cards'
import { PlayingCard, type CardAnimation, type CardSize } from './PlayingCard'
import styles from './CardHand.module.css'

/** Seconds between successive cards animating in, for a dealt-out feel. */
const STAGGER_STEP = 0.16

interface CardHandProps {
  cards: CardOrHidden[]
  size?: CardSize
  /**
   * Identifies the current deal (e.g. the hand number). When it changes, every
   * card is treated as freshly dealt and animates in with a stagger. Within the
   * same deal, only newly added cards (hits / dealer draws) animate, and a slot
   * that flips from face-down to face-up plays a flip.
   */
  dealKey?: number | string
  className?: string
}

function keyOf(card: CardOrHidden, index: number): string {
  return isHidden(card) ? `hidden-${index}` : `${card.rank}${card.suit}`
}

/**
 * Lays out a hand of cards in a slightly overlapping fan and animates changes.
 * Accepts hidden slots ({@link isHidden}) so the dealer's face-down hole card
 * renders as a card back.
 *
 * Animation is derived by diffing against the previous render (kept in a ref):
 * a new {@link CardHandProps.dealKey} re-deals the whole hand with a stagger,
 * appended cards deal in one after another, and a slot that changes from a
 * hidden back to a real card flips face-up.
 */
export function CardHand({ cards, size = 'md', dealKey, className }: CardHandProps) {
  // The previous committed render, recorded in an effect (never mutated during
  // render, so React StrictMode's double-invoked render stays consistent and
  // each card mounts with the correct entrance animation).
  const prev = useRef<{ dealKey?: number | string; keys: string[] } | null>(null)
  const previous = prev.current
  const freshDeal = !previous || previous.dealKey !== dealKey

  // Did any card just flip from face-down to face-up? (dealer hole-card reveal)
  const flipHappened =
    !freshDeal &&
    !!previous &&
    cards.some((card, i) => !isHidden(card) && previous.keys[i]?.startsWith('hidden-'))

  const decorate = (
    card: CardOrHidden,
    index: number
  ): { anim?: CardAnimation; delay: number } => {
    if (freshDeal) {
      return { anim: 'deal', delay: index * STAGGER_STEP }
    }
    if (!previous) return { delay: 0 }

    const wasHiddenHere = previous.keys[index]?.startsWith('hidden-')
    // A face-down slot becoming a real card = the hole card being revealed.
    if (!isHidden(card) && wasHiddenHere) {
      return { anim: 'flip', delay: 0 }
    }
    // A newly appended card (a hit, or the dealer drawing). Stagger any cards
    // added in the same update, after the reveal flip if one is playing.
    if (index >= previous.keys.length) {
      const offset = index - previous.keys.length + (flipHappened ? 1 : 0)
      return { anim: 'deal', delay: offset * STAGGER_STEP }
    }
    return { delay: 0 }
  }

  const rendered = cards.map((card, i) => {
    const { anim, delay } = decorate(card, i)
    // Prefix with the deal key so a new hand always remounts (and re-animates),
    // while cards keep a stable key within a hand (so hits don't re-animate).
    const key = `${dealKey ?? ''}-${keyOf(card, i)}`
    return isHidden(card) ? (
      <PlayingCard key={key} hidden size={size} anim={anim} delaySeconds={delay} />
    ) : (
      <PlayingCard key={key} card={card} size={size} anim={anim} delaySeconds={delay} />
    )
  })

  // Record this render for the next diff, after it commits.
  useEffect(() => {
    prev.current = { dealKey, keys: cards.map((c, i) => keyOf(c, i)) }
  })

  return (
    <div className={[styles.hand, styles[size], className ?? ''].filter(Boolean).join(' ')}>
      {rendered}
    </div>
  )
}
