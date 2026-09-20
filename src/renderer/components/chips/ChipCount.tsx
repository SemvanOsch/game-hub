import { formatChips } from '@shared/blackjack/rules'
import { useCountUp } from './useCountUp'
import styles from './ChipStack.module.css'

interface ChipCountProps {
  /** The authoritative chip amount (whole chips, possibly fractional). */
  value: number
  className?: string
}

/**
 * The numeric chip amount, tweened when it changes (ease-out) but always landing
 * on — and reporting to assistive tech — the exact authoritative value. During
 * the tween the intermediate frames are rounded to whole chips; the precise value
 * (including a half-chip) is shown once settled and is always the aria value.
 */
export function ChipCount({ value, className }: ChipCountProps) {
  const display = useCountUp(value)
  const settled = display === value
  const text = settled ? formatChips(value) : formatChips(Math.round(display))
  return (
    <span className={[styles.count, className ?? ''].filter(Boolean).join(' ')}>
      <span aria-hidden>{text}</span>
      <span className={styles.srOnly}>{formatChips(value)} chips</span>
    </span>
  )
}
