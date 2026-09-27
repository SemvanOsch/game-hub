import type { BuildingCard, SkipBoCard as SkipBoCardModel } from '@shared/skipbo/cards'
import styles from './SkipBoCard.module.css'

export type SkipBoCardSize = 'xs' | 'sm' | 'md' | 'lg'

/**
 * A Skip-Bo card face rendered entirely from CSS — no image assets, so it bundles
 * cleanly into the Electron app and scales crisply. Number cards are hue-coded by
 * value (so a 1→12 sequence reads at a glance); Skip-Bo wilds get a distinct gold
 * "SKIP-BO" face. Face-down cards render the patterned back (stock / draw pile /
 * opponent hands).
 *
 * Lives under the Skip-Bo game (not the shared card area) because Skip-Bo's
 * number/wild model is distinct from the standard 52-card {@link PlayingCard}.
 */
interface SkipBoCardProps {
  /** The card to render. Omit (with `back`) for a face-down card. */
  card?: SkipBoCardModel | BuildingCard
  /** Render the patterned card back. */
  back?: boolean
  size?: SkipBoCardSize
  /** Dim + non-interactive appearance for an illegal card. */
  disabled?: boolean
  /** Lift/selected appearance for a playable card. */
  playable?: boolean
  /** Ring highlight for the currently selected source card. */
  selected?: boolean
  onClick?: () => void
  className?: string
  /** Play the deal-in entrance animation once on mount. */
  animateIn?: boolean
  title?: string
}

/**
 * Official Skip-Bo colour band for a number value: dark blue for 1–4, green for
 * 5–8, red for 9–12.
 */
function bandClass(value: number | null): string {
  if (value == null) return ''
  if (value <= 4) return styles.blue
  if (value <= 8) return styles.green
  return styles.red
}

/** The number a card shows: its printed value, or the value a wild was played as. */
function displayValue(card: SkipBoCardModel | BuildingCard): number | null {
  if (card.type === 'number') return card.value
  // BuildingCard carries `playedAs` for a wild sitting on a pile.
  return 'playedAs' in card ? card.playedAs : null
}

export function SkipBoCard({
  card,
  back = false,
  size = 'md',
  disabled = false,
  playable = false,
  selected = false,
  onClick,
  className,
  animateIn = false,
  title
}: SkipBoCardProps) {
  const base = [styles.card, styles[size], animateIn ? styles.dealIn : '', className ?? ''].filter(
    Boolean
  )

  if (back || !card) {
    return <div className={[...base, styles.back].join(' ')} aria-label="Skip-Bo card" role="img" />
  }

  const isWild = card.type === 'skipbo'
  const value = displayValue(card)
  const label = describe(card)
  const interactive = Boolean(onClick) && !disabled
  const Wrapper = interactive ? 'button' : 'div'

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      className={[
        ...base,
        styles.face,
        isWild ? styles.wild : styles.number,
        isWild ? '' : bandClass(card.value),
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
      {isWild ? (
        <>
          <span className={styles.corner + ' ' + styles.tl} aria-hidden>
            ★
          </span>
          <span className={styles.wildText} aria-hidden>
            {value != null ? <span className={styles.wildAs}>{value}</span> : 'SKIP·BO'}
          </span>
          {value != null ? <span className={styles.wildTag} aria-hidden>SB</span> : null}
          <span className={styles.corner + ' ' + styles.br} aria-hidden>
            ★
          </span>
        </>
      ) : (
        <>
          <span className={[styles.corner, styles.tl].join(' ')} aria-hidden>
            {value}
          </span>
          <span className={styles.centre} aria-hidden>
            {value}
          </span>
          <span className={[styles.corner, styles.br].join(' ')} aria-hidden>
            {value}
          </span>
        </>
      )}
    </Wrapper>
  )
}

function describe(card: SkipBoCardModel | BuildingCard): string {
  if (card.type === 'skipbo') {
    const as = 'playedAs' in card ? card.playedAs : null
    return as != null ? `Skip-Bo (played as ${as})` : 'Skip-Bo wild'
  }
  return `${card.value}`
}
