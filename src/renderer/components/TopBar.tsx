import { useState } from 'react'
import { useProfileStore } from '../store/profileStore'
import { NameDialog } from './NameDialog'
import styles from './TopBar.module.css'

export function TopBar() {
  const name = useProfileStore((s) => s.name)
  const [editing, setEditing] = useState(false)

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden>
          ⬢
        </span>
        <span className={styles.title}>Game Launcher</span>
      </div>
      <button
        className={styles.profile}
        onClick={() => setEditing(true)}
        title="Change display name"
      >
        <span className={styles.avatar} aria-hidden>
          {name.charAt(0).toUpperCase() || '?'}
        </span>
        <span className={styles.name}>{name || 'Set name'}</span>
        <span className={styles.gear} aria-hidden>
          ⚙
        </span>
      </button>
      <NameDialog open={editing} onClose={() => setEditing(false)} />
    </header>
  )
}
