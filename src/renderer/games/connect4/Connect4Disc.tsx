import type { CSSProperties } from 'react'
import type { Connect4PlayerColor } from '@shared/connect4/types'
import styles from './Connect4Disc.module.css'

interface Connect4DiscProps {
  /** The disc's colour. `null` renders an empty slot (a hole in the board). */
  player: Connect4PlayerColor | null
  /** Board coordinates — used for accessible labelling. */
  row?: number
  column?: number
  /** Render as a translucent landing preview rather than a solid disc. */
  preview?: boolean
  /** Part of the winning line: adds the celebration highlight. */
  winning?: boolean
  /** Animate this disc falling into place from above the board. */
  dropping?: boolean
  /** How many rows the disc fell (drives the drop animation start offset). */
  dropRows?: number
}

/**
 * A single Connect 4 disc (or empty slot), rendered as a real circular UI
 * element — never an emoji. Colour, depth, drop animation, and the winning-line
 * highlight are all driven by props so the board stays purely declarative.
 */
export function Connect4Disc({
  player,
  preview = false,
  winning = false,
  dropping = false,
  dropRows = 0
}: Connect4DiscProps) {
  if (player === null && !preview) {
    return <span className={styles.empty} aria-hidden />
  }

  const color = player ?? 'red'
  const classes = [
    styles.disc,
    styles[color],
    preview ? styles.preview : '',
    winning ? styles.winning : '',
    dropping ? styles.dropping : ''
  ]
    .filter(Boolean)
    .join(' ')

  const style: CSSProperties | undefined = dropping
    ? ({ '--drop-rows': String(dropRows) } as CSSProperties)
    : undefined

  return <span className={classes} style={style} aria-hidden />
}
