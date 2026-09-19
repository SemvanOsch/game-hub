import styles from './Spinner.module.css'

export function Spinner({ label }: { label?: string }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} />
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  )
}
