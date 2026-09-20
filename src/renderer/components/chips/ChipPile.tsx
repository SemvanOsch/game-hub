import { formatChips } from '@shared/blackjack/rules'
import { planChipColumns } from '@shared/chips/breakdown'
import { ChipColumn } from './ChipColumn'
import { ChipCount } from './ChipCount'
import { EmptySlot } from './ChipStack'
import type { ChipSize } from './chipUtils'
import styles from './ChipStack.module.css'

interface ChipPileProps {
  /** Authoritative chip amount to represent (the value stays the source of truth). */
  amount: number
  size?: ChipSize
  /** Small caption under the number, e.g. "chips". */
  label?: string
  /** Bounds on the drawn pile so large balances never explode the DOM. */
  maxColumns?: number
  maxPerColumn?: number
  animateIn?: boolean
  /** Remount key: change it to replay the entrance animation. */
  dealKey?: number | string
  className?: string
}

/**
 * A substantial pile: several side-by-side stacks, one per denomination group,
 * bounded so it stays legible and cheap no matter how large the balance grows.
 * The exact value is shown beneath and is the accessible label. Good for a
 * player's main balance and the victory presentation.
 */
export function ChipPile({
  amount,
  size = 'medium',
  label,
  maxColumns = 4,
  maxPerColumn = 5,
  animateIn = false,
  dealKey,
  className
}: ChipPileProps) {
  const columns = planChipColumns(amount, { maxColumns, maxPerColumn })
  const empty = columns.length === 0
  const ariaLabel = `${formatChips(amount)} chips${label ? ` (${label})` : ''}`

  return (
    <div
      className={[styles.wrap, className ?? ''].filter(Boolean).join(' ')}
      role="img"
      aria-label={ariaLabel}
    >
      <div className={styles.pileRow} key={dealKey}>
        {empty ? (
          <EmptySlot size={size} />
        ) : (
          columns.map((col, i) => (
            <ChipColumn
              key={i}
              chips={Array.from({ length: col.count }, () => col.denomination)}
              size={size}
              animateIn={animateIn}
            />
          ))
        )}
      </div>
      <ChipCount value={amount} />
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  )
}
