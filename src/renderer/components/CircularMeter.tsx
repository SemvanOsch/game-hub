import styles from './CircularMeter.module.css'

interface CircularMeterProps {
  value: number
  max: number
  size?: number
  stroke?: number
  /** When true, the ring shows the "achieved" (gold) styling. */
  complete?: boolean
  /** Text rendered in the middle of the ring. */
  label: string
  title?: string
}

/** Small SVG progress ring, used to visualize upper-section bonus progress. */
export function CircularMeter({
  value,
  max,
  size = 42,
  stroke = 4,
  complete = false,
  label,
  title
}: CircularMeterProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(1, max === 0 ? 0 : value / max))
  const offset = circumference * (1 - pct)

  return (
    <span className={styles.wrap} style={{ width: size, height: size }} title={title}>
      <svg width={size} height={size} className={styles.svg}>
        <circle
          className={styles.track}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className={complete ? styles.progressComplete : styles.progress}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={[styles.label, complete ? styles.labelComplete : ''].join(' ')}>
        {label}
      </span>
    </span>
  )
}
