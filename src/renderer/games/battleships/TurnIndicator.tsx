import styles from './TurnIndicator.module.css'

interface TurnIndicatorProps {
  yourTurn: boolean
  opponentName: string
  /** Optional shot-feedback line, e.g. "Hit!" or "You sunk their Cruiser!". */
  feedback?: string | null
}

/** Prominent banner making the current turn unmistakable. */
export function TurnIndicator({ yourTurn, opponentName, feedback }: TurnIndicatorProps) {
  return (
    <div className={[styles.banner, yourTurn ? styles.you : styles.other].join(' ')}>
      <div className={styles.main}>
        <strong className={styles.headline}>
          {yourTurn ? 'Your turn' : `Waiting for ${opponentName}…`}
        </strong>
        <span className={styles.sub}>
          {yourTurn
            ? 'Pick a cell on Enemy Waters to fire.'
            : 'They are choosing where to fire.'}
        </span>
      </div>
      {feedback ? <span className={styles.feedback}>{feedback}</span> : null}
    </div>
  )
}
