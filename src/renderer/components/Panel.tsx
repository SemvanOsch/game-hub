import type { ReactNode } from 'react'
import styles from './Panel.module.css'

interface PanelProps {
  title: string
  subtitle?: string
  icon?: string
  onBack?: () => void
  backLabel?: string
  children: ReactNode
}

/** Centered card layout used by the launcher menu/join screens. */
export function Panel({ title, subtitle, icon, onBack, backLabel = 'Back', children }: PanelProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        {onBack ? (
          <button className={styles.back} onClick={onBack}>
            ← {backLabel}
          </button>
        ) : null}
        {icon ? (
          <div className={styles.icon} aria-hidden>
            {icon}
          </div>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
