import { useState } from 'react'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import { NameDialog } from './NameDialog'
import { AuthDialog } from './AuthDialog'
import styles from './TopBar.module.css'

interface TopBarProps {
  /** Open the friends hub (only shown when logged in). */
  onOpenFriends?: () => void
  /** Return to the home screen (from the brand logo). */
  onGoHome?: () => void
}

export function TopBar({ onOpenFriends, onGoHome }: TopBarProps) {
  const name = useProfileStore((s) => s.name)
  const session = useAuthStore((s) => s.session)
  const incomingCount = useAuthStore((s) => s.incoming.length)
  const logout = useAuthStore((s) => s.logout)

  const [editing, setEditing] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  const displayName = session?.username ?? name

  return (
    <header className={styles.bar}>
      <button className={styles.brand} onClick={onGoHome} title="Go to home screen">
        <span className={styles.logo} aria-hidden>
          ⬢
        </span>
        <span className={styles.title}>Game Hub</span>
      </button>

      <div className={styles.actions}>
        {session ? (
          <button className={styles.action} onClick={onOpenFriends} title="Friends">
            <span aria-hidden>👥</span>
            <span>Friends</span>
            {incomingCount > 0 ? <span className={styles.badge}>{incomingCount}</span> : null}
          </button>
        ) : (
          <button className={styles.action} onClick={() => setAuthOpen(true)}>
            Log in
          </button>
        )}

        <button
          className={styles.profile}
          onClick={() => setEditing(true)}
          title="Display name & theme"
        >
          <span className={styles.avatar} aria-hidden>
            {displayName.charAt(0).toUpperCase() || '?'}
          </span>
          <span className={styles.name}>{displayName || 'Set name'}</span>
          <span className={styles.gear} aria-hidden>
            ⚙
          </span>
        </button>

        {session ? (
          <button className={styles.action} onClick={logout} title="Log out">
            Log out
          </button>
        ) : null}
      </div>

      <NameDialog open={editing} onClose={() => setEditing(false)} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  )
}
