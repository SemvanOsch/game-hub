import type { DragEvent, MouseEvent } from 'react'
import type { RummikubTile as Tile } from '@shared/rummikub/types'
import styles from './RummikubTile.module.css'

export interface RummikubTileProps {
  tile: Tile
  selected?: boolean
  disabled?: boolean
  draggable?: boolean
  /** Renders a face-down tile back (used for opponents' hidden racks). */
  faceDown?: boolean
  size?: 'sm' | 'md' | 'lg'
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void
  title?: string
}

/**
 * A single Rummikub tile rendered as a physical-looking numbered game piece:
 * rounded ivory body, depth shadow, a large colour-coded number, and hover /
 * selected / dragging / disabled states. Jokers show a drawn smiley face (no
 * emoji). Reused on the rack, in table groups and as drag previews.
 */
export function RummikubTile({
  tile,
  selected = false,
  disabled = false,
  draggable = false,
  faceDown = false,
  size = 'md',
  onClick,
  onDragStart,
  onDragEnd,
  title
}: RummikubTileProps) {
  const classes = [
    styles.tile,
    styles[size],
    selected ? styles.selected : '',
    disabled ? styles.disabled : '',
    faceDown ? styles.back : '',
    tile.isJoker ? styles.joker : '',
    onClick && !disabled ? styles.clickable : ''
  ]
    .filter(Boolean)
    .join(' ')

  if (faceDown) {
    return <div className={classes} aria-hidden />
  }

  return (
    <div
      className={classes}
      data-color={tile.isJoker ? 'joker' : tile.color}
      draggable={draggable && !disabled}
      onClick={disabled ? undefined : onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={title}
      role={onClick ? 'button' : undefined}
      aria-pressed={onClick ? selected : undefined}
    >
      {tile.isJoker ? (
        <JokerFace />
      ) : (
        <span className={styles.number}>{tile.value}</span>
      )}
      <span className={styles.dot} aria-hidden />
    </div>
  )
}

/** A simple drawn joker smiley — SVG, never an emoji glyph. */
function JokerFace() {
  return (
    <svg className={styles.jokerFace} viewBox="0 0 24 24" aria-label="Joker" role="img">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="10" r="1.4" fill="currentColor" />
      <circle cx="15" cy="10" r="1.4" fill="currentColor" />
      <path
        d="M8 14.5c1.2 1.6 2.6 2.4 4 2.4s2.8-.8 4-2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
