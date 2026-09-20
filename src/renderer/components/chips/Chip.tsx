import { useState, type CSSProperties } from 'react'
import type { ChipDenomination } from '@shared/chips/breakdown'
import { chipColorVars, type ChipSize } from './chipUtils'
import styles from './Chip.module.css'

interface ChipProps {
  denomination: ChipDenomination
  size?: ChipSize
  /** Play a one-shot drop-in entrance when the chip mounts. */
  animateIn?: boolean
  /** Delay before the entrance animation, in seconds (for staggering a stack). */
  delaySeconds?: number
  className?: string
  style?: CSSProperties
}

/**
 * A single casino-style poker chip rendered entirely in CSS — coloured rim with
 * edge spots, a lighter inner face with a dashed ring, the denomination printed
 * in the centre, and layered shadows/highlights for a subtle 3-D feel. No images
 * and no emoji, so it bundles cleanly and scales crisply at every size.
 *
 * Lives in the shared components area (not inside Blackjack) so future card games
 * can reuse it. Decorative by default (`aria-hidden`): the accessible amount is
 * provided by the enclosing {@link ChipStack}/{@link ChipPile}. The printed value
 * means the denomination never relies on colour alone.
 */
export function Chip({
  denomination,
  size = 'medium',
  animateIn = false,
  delaySeconds,
  className,
  style
}: ChipProps) {
  // Latch the entrance to mount so a parent re-render mid-animation can't cut it.
  const [mountAnim] = useState(animateIn)
  const classes = [styles.chip, styles[size], mountAnim ? styles.drop : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  const merged: CSSProperties = {
    ...chipColorVars(denomination),
    ...(mountAnim && delaySeconds ? { animationDelay: `${delaySeconds}s` } : null),
    ...style
  }
  return (
    <div className={classes} style={merged} aria-hidden>
      <span className={styles.value}>{denomination}</span>
    </div>
  )
}
