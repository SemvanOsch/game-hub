import type { ShipType } from '@shared/battleships/types'
import styles from './FleetStatus.module.css'

/**
 * A fleet row. `damage` (per-cell hit flags) is optional: it is shown on the
 * game-over screen, where both fleets are fully revealed, but omitted in-game
 * where an opponent's hit counts must stay hidden.
 */
export interface FleetDisplayEntry {
  type: ShipType
  name: string
  length: number
  sunk: boolean
  damage?: boolean[]
}

interface FleetStatusProps {
  title: string
  fleet: FleetDisplayEntry[]
  /** Only list ships that are still afloat (used on the results screen). */
  aliveOnly?: boolean
  /** Message shown when `aliveOnly` leaves nothing to display. */
  emptyLabel?: string
}

/**
 * Compact per-side ship list showing which ships are afloat/sunk and, when
 * `damage` is provided, how many times each surviving ship has been hit.
 */
export function FleetStatus({
  title,
  fleet,
  aliveOnly = false,
  emptyLabel = 'No ships remaining'
}: FleetStatusProps) {
  const shown = aliveOnly ? fleet.filter((s) => !s.sunk) : fleet
  const afloat = fleet.filter((s) => !s.sunk).length

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <span className={styles.count}>
          {afloat}/{fleet.length} afloat
        </span>
      </div>
      {shown.length === 0 ? (
        <p className={styles.empty}>{emptyLabel}</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((ship) => {
            const hits = ship.damage ? ship.damage.filter(Boolean).length : 0
            return (
              <li key={ship.type} className={[styles.item, ship.sunk ? styles.sunk : ''].join(' ')}>
                <span className={styles.pips} aria-hidden>
                  {Array.from({ length: ship.length }).map((_, i) => (
                    <span
                      key={i}
                      className={[styles.pip, ship.damage?.[i] ? styles.pipHit : ''].join(' ')}
                    />
                  ))}
                </span>
                <span className={styles.name}>{ship.name}</span>
                <span className={styles.state}>
                  {ship.sunk
                    ? 'Sunk'
                    : ship.damage
                      ? hits > 0
                        ? `${hits} hit${hits > 1 ? 's' : ''}`
                        : 'Unhit'
                      : 'Afloat'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
