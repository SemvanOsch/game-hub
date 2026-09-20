import { formatChips } from '@shared/blackjack/rules'
import { planMixedColumn } from '@shared/chips/breakdown'
import { ChipColumn } from './ChipColumn'
import { ChipCount } from './ChipCount'
import { CHIP_DIAMETER, type ChipSize } from './chipUtils'
import styles from './ChipStack.module.css'

interface ChipStackProps {
  /** Authoritative chip amount to represent (the value stays the source of truth). */
  amount: number
  size?: ChipSize
  /** Small caption under the number, e.g. "chips" or "bet". */
  label?: string
  /** Cap on drawn chips (the numeric label always carries the exact value). */
  maxChips?: number
  /** Play a drop-in entrance for the chips. */
  animateIn?: boolean
  /** Remount key: change it (e.g. per hand) to replay the entrance animation. */
  dealKey?: number | string
  className?: string
}

/**
 * A compact, single mixed stack representing an amount (largest denomination at
 * the bottom), with the exact numeric value beneath. Good for a hand's bet or an
 * opponent's balance. The whole component is an accessible image labelled with
 * the exact amount; the chip graphics themselves are decorative.
 */
export function ChipStack({
  amount,
  size = 'medium',
  label,
  maxChips = 6,
  animateIn = false,
  dealKey,
  className
}: ChipStackProps) {
  const chips = planMixedColumn(amount, maxChips)
  const empty = chips.length === 0
  const ariaLabel = `${formatChips(amount)} chips${label ? ` (${label})` : ''}`

  return (
    <div
      className={[styles.wrap, className ?? ''].filter(Boolean).join(' ')}
      role="img"
      aria-label={ariaLabel}
    >
      <div className={styles.chips}>
        {empty ? (
          <EmptySlot size={size} />
        ) : (
          <ChipColumn key={dealKey} chips={chips} size={size} animateIn={animateIn} />
        )}
      </div>
      <ChipCount value={amount} />
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  )
}

/** A muted dashed ring shown when there are no chips to draw (amount 0). */
export function EmptySlot({ size }: { size: ChipSize }) {
  const d = CHIP_DIAMETER[size]
  return <div className={styles.empty} style={{ width: d, height: d }} aria-hidden />
}
