import { useState } from 'react'
import type { Card, Suit } from '@shared/blackjack/cards'
import styles from './PlayingCard.module.css'

export type CardSize = 'sm' | 'md' | 'lg'

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
}

function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds'
}

/** How a card enters: dealt in from the deck, or flipped face-up on reveal. */
export type CardAnimation = 'deal' | 'flip'

interface PlayingCardProps {
  /** The card to render. Omitted when `hidden` is true. */
  card?: Card
  /** Render the face-down card back (the dealer's hidden hole card). */
  hidden?: boolean
  size?: CardSize
  /** Entrance animation to play once when the card mounts. */
  anim?: CardAnimation
  /** Delay before the entrance animation starts, in seconds (for staggering). */
  delaySeconds?: number
  className?: string
}

/**
 * A reusable, designed playing-card face rendered entirely from vector text and
 * CSS — no external image assets, so it bundles cleanly into the Electron app
 * and scales crisply. Shows corner indices (rank + suit, top-left and
 * bottom-right) and a large centre suit, with correct red/black colouring,
 * rounded corners and standard 5:7 proportions.
 *
 * Placed in the shared components area (not inside Blackjack) so future card
 * games can reuse it: `<PlayingCard card={card} />` or `<PlayingCard hidden />`.
 */
export function PlayingCard({
  card,
  hidden = false,
  size = 'md',
  anim,
  delaySeconds,
  className
}: PlayingCardProps) {
  // Latch the entrance animation to the card's MOUNT. A one-shot CSS animation
  // must not be re-evaluated on later re-renders (a parent re-rendering while
  // the animation plays would otherwise strip the class and cut it off). The
  // card's React key already forces a fresh mount whenever it should re-animate.
  const [mountAnim] = useState(anim)
  const [mountDelay] = useState(delaySeconds)

  const animClass = mountAnim === 'flip' ? styles.flip : mountAnim === 'deal' ? styles.deal : ''
  const classes = [styles.card, styles[size], animClass, className ?? '']
    .filter(Boolean)
    .join(' ')
  // A delay only matters while an entrance animation is playing.
  const style = mountAnim && mountDelay ? { animationDelay: `${mountDelay}s` } : undefined

  if (hidden || !card) {
    return (
      <div
        className={[classes, styles.back].join(' ')}
        style={style}
        aria-label="Face-down card"
        role="img"
      >
        <div className={styles.backArt} aria-hidden />
      </div>
    )
  }

  const glyph = SUIT_GLYPH[card.suit]
  const colorClass = isRed(card.suit) ? styles.red : styles.black

  return (
    <div
      className={[classes, styles.face, colorClass].join(' ')}
      style={style}
      role="img"
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <span className={[styles.corner, styles.tl].join(' ')} aria-hidden>
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.cornerSuit}>{glyph}</span>
      </span>
      <span className={styles.pip} aria-hidden>
        {glyph}
      </span>
      <span className={[styles.corner, styles.br].join(' ')} aria-hidden>
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.cornerSuit}>{glyph}</span>
      </span>
    </div>
  )
}
