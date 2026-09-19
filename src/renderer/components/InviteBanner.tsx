import type { GameInvite } from '@shared/types'
import { useAuthStore } from '../store/authStore'
import { getGame } from '../games/registry'
import { Button } from './Button'
import styles from './InviteBanner.module.css'

interface InviteBannerProps {
  /** Join the invited room. The banner clears the invite itself. */
  onAccept: (invite: GameInvite) => void
}

/** Fixed stack of incoming game invitations with accept/decline actions. */
export function InviteBanner({ onAccept }: InviteBannerProps) {
  const invites = useAuthStore((s) => s.invites)
  const dismissInvite = useAuthStore((s) => s.dismissInvite)

  if (invites.length === 0) return null

  return (
    <div className={styles.stack}>
      {invites.map((invite) => {
        const gameName = getGame(invite.gameId)?.name ?? 'a game'
        const icon = getGame(invite.gameId)?.icon ?? '🎮'
        return (
          <div key={invite.code} className={styles.banner} role="alert">
            <span className={styles.icon} aria-hidden>
              {icon}
            </span>
            <span className={styles.text}>
              <strong>{invite.fromUser.username}</strong> invited you to {gameName}
            </span>
            <div className={styles.actions}>
              <Button
                size="sm"
                onClick={() => {
                  onAccept(invite)
                  dismissInvite(invite.code)
                }}
              >
                Join
              </Button>
              <Button size="sm" variant="ghost" onClick={() => dismissInvite(invite.code)}>
                Dismiss
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
