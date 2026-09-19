import { useEffect } from 'react'
import styles from './Toast.module.css'

interface ToastProps {
  message: string | null
  onDismiss: () => void
  /** Auto-dismiss after this many ms (0 disables). */
  timeout?: number
}

export function Toast({ message, onDismiss, timeout = 5000 }: ToastProps) {
  useEffect(() => {
    if (!message || !timeout) return
    const id = window.setTimeout(onDismiss, timeout)
    return () => window.clearTimeout(id)
  }, [message, timeout, onDismiss])

  if (!message) return null
  return (
    <div className={styles.toast} role="alert">
      <span className={styles.icon} aria-hidden>
        ⚠
      </span>
      <span className={styles.message}>{message}</span>
      <button className={styles.close} onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
