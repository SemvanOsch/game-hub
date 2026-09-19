import styles from './Die.module.css'

const PIP_LAYOUT: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 4, 7, 3, 6, 9]
}

interface DieProps {
  value: number
  held: boolean
  disabled?: boolean
  /** value 0 renders an empty, not-yet-rolled die. */
  onClick?: () => void
}

export function Die({ value, held, disabled = false, onClick }: DieProps) {
  const rolled = value >= 1 && value <= 6
  const pips = rolled ? PIP_LAYOUT[value] : []
  const interactive = Boolean(onClick) && !disabled && rolled

  return (
    <button
      type="button"
      className={[styles.die, held ? styles.held : '', interactive ? styles.interactive : ''].join(' ')}
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-pressed={held}
      aria-label={rolled ? `Die showing ${value}${held ? ', held' : ''}` : 'Empty die'}
    >
      <span className={styles.face}>
        {Array.from({ length: 9 }, (_, i) => i + 1).map((cell) => (
          <span key={cell} className={styles.cell}>
            {pips.includes(cell) ? <span className={styles.pip} /> : null}
          </span>
        ))}
      </span>
      {held ? <span className={styles.heldTag}>HELD</span> : null}
    </button>
  )
}
