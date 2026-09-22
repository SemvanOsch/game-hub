import type { UnoCard as UnoCardModel, UnoColor } from '@shared/uno/cards'
import styles from './UnoCard.module.css'

export type UnoCardSize = 'sm' | 'md' | 'lg'

/**
 * A designed UNO card face rendered entirely from CSS + inline SVG — no image
 * assets, so it bundles cleanly into the Electron app and scales crisply. The
 * classic look: a solid colour body with a white tilted oval, a large centre
 * symbol and matching corner indices. Wild cards use the four-colour pie.
 *
 * Lives under the UNO game (not the shared card area) because UNO's colour/type
 * model is distinct from the standard 52-card {@link PlayingCard}.
 */
interface UnoCardProps {
  /** The card to render. Omit (with `back`) for a face-down card. */
  card?: UnoCardModel
  /** Render the patterned card back (draw pile / opponent hands). */
  back?: boolean
  size?: UnoCardSize
  /** Dim + non-interactive appearance for an illegal card. */
  disabled?: boolean
  /** Lift/selected appearance for a playable card. */
  playable?: boolean
  onClick?: () => void
  className?: string
  /** Play the deal-in entrance animation once on mount. */
  animateIn?: boolean
  title?: string
}

const COLOR_CLASS: Record<UnoColor, string> = {
  red: styles.red,
  yellow: styles.yellow,
  green: styles.green,
  blue: styles.blue
}

/** Short corner label for a card (digit, +2, +4, or an action glyph). */
function cornerLabel(card: UnoCardModel): string {
  switch (card.type) {
    case 'number':
      return String(card.value)
    case 'draw_two':
      return '+2'
    case 'wild_draw_four':
      return '+4'
    case 'skip':
      return '⦸'
    case 'reverse':
      return '⇅'
    case 'wild':
      return ''
  }
}

function SkipGlyph() {
  return (
    <svg viewBox="0 0 100 100" className={styles.glyphSvg} aria-hidden focusable="false">
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="12" />
      <line x1="26" y1="26" x2="74" y2="74" stroke="currentColor" strokeWidth="12" />
    </svg>
  )
}

function ReverseGlyph() {
  return (
    <svg viewBox="0 0 100 100" className={styles.glyphSvg} aria-hidden focusable="false">
      <path
        d="M32 30 L32 62 M32 62 L22 52 M32 62 L42 52"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M68 70 L68 38 M68 38 L58 48 M68 38 L78 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The four-colour pie used for wild cards' centre. */
function WildPie({ label }: { label?: string }) {
  return (
    <span className={styles.wildPie} aria-hidden>
      <span className={[styles.wildQuad, styles.qRed].join(' ')} />
      <span className={[styles.wildQuad, styles.qBlue].join(' ')} />
      <span className={[styles.wildQuad, styles.qYellow].join(' ')} />
      <span className={[styles.wildQuad, styles.qGreen].join(' ')} />
      {label ? <span className={styles.wildLabel}>{label}</span> : null}
    </span>
  )
}

function centreSymbol(card: UnoCardModel) {
  switch (card.type) {
    case 'number':
      return <span className={styles.bigNum}>{card.value}</span>
    case 'draw_two':
      return <span className={styles.bigNum}>+2</span>
    case 'skip':
      return <SkipGlyph />
    case 'reverse':
      return <ReverseGlyph />
    case 'wild':
      return <WildPie />
    case 'wild_draw_four':
      return <WildPie label="+4" />
  }
}

export function UnoCard({
  card,
  back = false,
  size = 'md',
  disabled = false,
  playable = false,
  onClick,
  className,
  animateIn = false,
  title
}: UnoCardProps) {
  const classes = [
    styles.card,
    styles[size],
    animateIn ? styles.dealIn : '',
    className ?? ''
  ].filter(Boolean)

  if (back || !card) {
    return <div className={[...classes, styles.back].join(' ')} aria-label="UNO card" role="img" />
  }

  const isWildCard = card.type === 'wild' || card.type === 'wild_draw_four'
  const colorClass = card.color ? COLOR_CLASS[card.color] : styles.wild
  const label = describe(card)
  const corner = cornerLabel(card)

  const interactive = Boolean(onClick) && !disabled
  const Wrapper = interactive ? 'button' : 'div'

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      className={[
        ...classes,
        styles.face,
        colorClass,
        playable ? styles.playable : '',
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
      {!isWildCard ? <span className={styles.oval} aria-hidden /> : null}
      <span className={[styles.corner, styles.tl].join(' ')} aria-hidden>
        {card.type === 'skip' || card.type === 'reverse' ? (
          <span className={styles.cornerGlyph}>{card.type === 'skip' ? '⦸' : '⇅'}</span>
        ) : (
          corner
        )}
      </span>
      <span className={styles.centre}>{centreSymbol(card)}</span>
      <span className={[styles.corner, styles.br].join(' ')} aria-hidden>
        {card.type === 'skip' || card.type === 'reverse' ? (
          <span className={styles.cornerGlyph}>{card.type === 'skip' ? '⦸' : '⇅'}</span>
        ) : (
          corner
        )}
      </span>
    </Wrapper>
  )
}

function describe(card: UnoCardModel): string {
  const color = card.color ? card.color[0].toUpperCase() + card.color.slice(1) : ''
  switch (card.type) {
    case 'number':
      return `${color} ${card.value}`
    case 'skip':
      return `${color} Skip`
    case 'reverse':
      return `${color} Reverse`
    case 'draw_two':
      return `${color} Draw Two`
    case 'wild':
      return 'Wild'
    case 'wild_draw_four':
      return 'Wild Draw Four'
  }
}
