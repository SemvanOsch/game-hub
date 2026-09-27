import type { BeverbendeCard as BeverbendeCardModel } from '@shared/beverbende/cards'
import styles from './BeverbendeCard.module.css'

export type BeverbendeCardSize = 'xs' | 'sm' | 'md' | 'lg'

/**
 * A Beverbende card face rendered entirely from CSS + inline SVG — no image assets
 * and no copyrighted artwork, so it bundles cleanly into the Electron app and scales
 * crisply. Number cards are hue-banded (low = cool/"good", high = warm/"bad") so the
 * 0→9 scale reads at a glance; the three power cards each get a distinct colour and a
 * small vector glyph. Face-down cards render a patterned back.
 */
interface BeverbendeCardProps {
  /** The card to render. Omit (with `back`) for a face-down card. */
  card?: BeverbendeCardModel
  /** Render the patterned card back (an unknown card). */
  back?: boolean
  size?: BeverbendeCardSize
  disabled?: boolean
  /** Lift/hover affordance for a card the player can act on. */
  playable?: boolean
  /** Ring highlight for the currently selected card. */
  selected?: boolean
  onClick?: () => void
  className?: string
  title?: string
}

/** Hue band for a number value: 0–3 teal (good), 4–6 blue, 7–8 amber, 9 red (bad). */
function bandClass(value: number): string {
  if (value <= 3) return styles.good
  if (value <= 6) return styles.mid
  if (value <= 8) return styles.high
  return styles.bad
}

const SPECIAL_LABEL: Record<string, string> = {
  peek: 'Peek — look at one of your own cards',
  swap: 'Swap — trade a card with an opponent',
  drawTwo: 'Draw Two — draw, then optionally draw again'
}

function SpecialGlyph({ kind }: { kind: 'peek' | 'swap' | 'drawTwo' }) {
  if (kind === 'peek') {
    return (
      <svg viewBox="0 0 24 24" className={styles.glyph} aria-hidden focusable="false">
        <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="14.5" y1="14.5" x2="20" y2="20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'swap') {
    return (
      <svg viewBox="0 0 24 24" className={styles.glyph} aria-hidden focusable="false">
        <path d="M5 9h11l-3-3M19 15H8l3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className={styles.glyph} aria-hidden focusable="false">
      <rect x="4" y="7" width="9" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="9" y="4" width="9" height="12" rx="2" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function BeverbendeCard({
  card,
  back = false,
  size = 'md',
  disabled = false,
  playable = false,
  selected = false,
  onClick,
  className,
  title
}: BeverbendeCardProps) {
  const base = [styles.card, styles[size], className ?? ''].filter(Boolean)

  if (back || !card) {
    return (
      <div className={[...base, styles.back].join(' ')} role="img" aria-label="Face-down card">
        <span className={styles.backMark} aria-hidden />
      </div>
    )
  }

  const isNumber = card.type === 'number'
  const label = isNumber ? String(card.value) : SPECIAL_LABEL[card.type]
  const interactive = Boolean(onClick) && !disabled
  const Wrapper = interactive ? 'button' : 'div'

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      className={[
        ...base,
        styles.face,
        isNumber ? bandClass(card.value) : styles.special,
        !isNumber ? styles[card.type] : '',
        playable ? styles.playable : '',
        selected ? styles.selected : '',
        disabled ? styles.disabled : '',
        interactive ? styles.interactive : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={interactive ? onClick : undefined}
      disabled={interactive ? disabled : undefined}
      aria-label={label}
      title={title ?? label}
      role={interactive ? undefined : 'img'}
    >
      {isNumber ? (
        <>
          <span className={[styles.corner, styles.tl].join(' ')} aria-hidden>
            {card.value}
          </span>
          <span className={styles.centre} aria-hidden>
            {card.value}
          </span>
          <span className={[styles.corner, styles.br].join(' ')} aria-hidden>
            {card.value}
          </span>
        </>
      ) : (
        <>
          <SpecialGlyph kind={card.type} />
          <span className={styles.specialName} aria-hidden>
            {card.type === 'drawTwo' ? 'DRAW 2' : card.type === 'peek' ? 'PEEK' : 'SWAP'}
          </span>
        </>
      )}
    </Wrapper>
  )
}
