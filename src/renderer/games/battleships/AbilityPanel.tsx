import {
  ABILITY_META,
  ABILITY_TYPES,
  type AbilityInventory,
  type AbilityType
} from '@shared/battleships/abilities'
import { AbilityIcon } from './abilityIcons'
import styles from './AbilityPanel.module.css'

interface AbilityPanelProps {
  abilities: AbilityInventory
  /** The currently-armed ability, or null when firing normal shots. */
  selected: AbilityType | null
  /** Whether the player may arm/fire an ability right now (their turn). */
  enabled: boolean
  onSelect: (ability: AbilityType | null) => void
}

/**
 * The Abilities dock: one polished button per ability showing its custom icon,
 * name, and remaining charges. Zero-charge abilities stay visible but disabled
 * so the player always knows they exist. Selecting an armed ability toggles
 * targeting mode on the enemy board.
 */
export function AbilityPanel({ abilities, selected, enabled, onSelect }: AbilityPanelProps) {
  return (
    <section className={styles.panel} aria-label="Abilities">
      <span className={styles.heading}>Abilities</span>
      <div className={styles.row}>
        {ABILITY_TYPES.map((ability) => {
          const meta = ABILITY_META[ability]
          const charges = abilities[meta.inventoryKey]
          const isSelected = selected === ability
          const disabled = !enabled || charges <= 0
          return (
            <button
              key={ability}
              type="button"
              className={[styles.btn, isSelected ? styles.selected : ''].filter(Boolean).join(' ')}
              disabled={disabled}
              aria-pressed={isSelected}
              title={`${meta.name} — ${meta.description}`}
              onClick={() => onSelect(isSelected ? null : ability)}
            >
              <AbilityIcon ability={ability} className={styles.icon} size={20} />
              <span className={styles.name}>{meta.name}</span>
              <span className={styles.charges} aria-label={`${charges} available`}>
                {charges}
              </span>
            </button>
          )
        })}
      </div>
      <span className={styles.hint}>
        {selected ? (
          <>
            {selected === 'scatter_missile'
              ? 'Target + 5 random cells'
              : `Pick a target — ${ABILITY_META[selected].description.toLowerCase().replace(/\.$/, '')}`}
            <button type="button" className={styles.cancel} onClick={() => onSelect(null)}>
              Cancel
            </button>
          </>
        ) : (
          'Use instead of a normal shot'
        )}
      </span>
    </section>
  )
}
