import { SHIP_NAMES } from '@shared/battleships/types'
import { ABILITY_META } from '@shared/battleships/abilities'
import type { LastAbilityEvent } from '@shared/battleships/engine'
import { AbilityIcon } from './abilityIcons'
import styles from './AbilityResultToast.module.css'

interface AbilityResultToastProps {
  event: LastAbilityEvent
  selfId: string
}

/**
 * Compact result card shown briefly after an ability resolves. Reports only
 * public information (cell counts, hit/miss totals, which ship types sank) — no
 * hidden ship positions are revealed.
 */
export function AbilityResultToast({ event, selfId }: AbilityResultToastProps) {
  const mine = event.by === selfId
  const meta = ABILITY_META[event.ability]
  const cells = event.cells.length
  const sunk = event.sunkShipTypes.map((t) => SHIP_NAMES[t])

  return (
    <div className={styles.toast} role="status">
      <span className={styles.icon}>
        <AbilityIcon ability={event.ability} size={26} />
      </span>
      <div className={styles.body}>
        <strong className={styles.title}>
          {meta.name} {mine ? 'fired' : 'incoming'}
        </strong>
        <span className={styles.stats}>
          {cells} cell{cells === 1 ? '' : 's'} · {event.hits} hit{event.hits === 1 ? '' : 's'} ·{' '}
          {event.misses} miss{event.misses === 1 ? '' : 'es'}
        </span>
        {sunk.length > 0 ? (
          <span className={styles.sunk}>
            {mine ? '' : 'Your '}
            {sunk.join(', ')} sunk
          </span>
        ) : null}
      </div>
    </div>
  )
}
