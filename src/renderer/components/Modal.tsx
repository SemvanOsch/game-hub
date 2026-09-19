import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

interface ModalProps {
  open: boolean
  title: string
  children: ReactNode
  /** Omit to make the modal non-dismissable (e.g. required first-launch name). */
  onClose?: () => void
}

export function Modal({ open, title, children, onClose }: ModalProps) {
  useEffect(() => {
    if (!open || !onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  // Portal to <body> so the fixed overlay is centered on the screen and not
  // trapped inside a positioned/backdrop-filtered ancestor (e.g. the TopBar).
  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.header}>
          <h3>{title}</h3>
          {onClose ? (
            <button className={styles.close} onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body
  )
}
