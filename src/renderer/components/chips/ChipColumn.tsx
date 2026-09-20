import type { CSSProperties } from 'react'
import type { ChipDenomination } from '@shared/chips/breakdown'
import { Chip } from './Chip'
import { CHIP_DIAMETER, CHIP_STACK_STEP, stackJitter, type ChipSize } from './chipUtils'
import styles from './ChipColumn.module.css'

interface ChipColumnProps {
  /** Chips bottom-to-top (index 0 is the bottom of the pile). */
  chips: ChipDenomination[]
  size: ChipSize
  /** Play a staggered drop-in as the column mounts (topmost lands last). */
  animateIn?: boolean
  className?: string
}

/**
 * A single vertical stack of chips: the top chip's full face shows, with the
 * rims of the chips beneath peeking downward. Purely decorative — the enclosing
 * component supplies the accessible amount, so this is `aria-hidden`.
 */
/** Horizontal padding each side of a chip within its column (room for jitter). */
const COLUMN_PAD = 2

export function ChipColumn({ chips, size, animateIn = false, className }: ChipColumnProps) {
  const d = CHIP_DIAMETER[size]
  const step = CHIP_STACK_STEP[size]
  const height = d + Math.max(0, chips.length - 1) * step
  const style: CSSProperties = { width: d + COLUMN_PAD * 2, height }

  return (
    <div className={[styles.column, className ?? ''].filter(Boolean).join(' ')} style={style} aria-hidden>
      {chips.map((denomination, i) => (
        <Chip
          key={i}
          denomination={denomination}
          size={size}
          animateIn={animateIn}
          // Lower chips land first, the top chip last, for a settling stack.
          delaySeconds={animateIn ? i * 0.05 : undefined}
          className={styles.stacked}
          // Centre via `left` (not `transform`): the drop-in animation animates
          // `transform` and would otherwise override a translateX centre, leaving
          // the settled chips off-centre.
          style={{
            bottom: i * step,
            left: COLUMN_PAD + stackJitter(i),
            zIndex: i
          }}
        />
      ))}
    </div>
  )
}
