import type { RoomPlayer } from '@shared/types'
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  LOWER_CATEGORIES,
  UPPER_CATEGORIES,
  type Category
} from '@shared/yahtzee/categories'
import {
  UPPER_BONUS_THRESHOLD,
  calculatePossibleScores,
  calculateTotals
} from '@shared/yahtzee/scoring'
import type { YahtzeeGameState } from '@shared/yahtzee/engine'
import { CircularMeter } from './CircularMeter'
import styles from './Scorecard.module.css'

interface ScorecardProps {
  game: YahtzeeGameState
  players: RoomPlayer[]
  selfId: string
  /** True when the local player may pick a category right now. */
  canScore: boolean
  onScore: (category: Category) => void
}

export function Scorecard({ game, players, selfId, canScore, onScore }: ScorecardProps) {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const columns = game.playerOrder
  const currentId = game.playerOrder[game.currentPlayerIndex]
  const totals = Object.fromEntries(
    columns.map((id) => [id, calculateTotals(game.scorecards[id]?.scores ?? {})])
  )
  const previews = canScore && game.rollsUsed > 0 ? calculatePossibleScores(game.dice) : null

  const renderCategoryRow = (category: Category) => (
    <tr key={category} className={styles.row}>
      <th scope="row" className={styles.rowHead}>
        <span className={styles.catLabel}>{CATEGORY_LABELS[category]}</span>
        <span className={styles.catHint}>{CATEGORY_HINTS[category]}</span>
      </th>
      {columns.map((id) => {
        const filled = game.scorecards[id]?.scores[category]
        const isSelfColumn = id === selfId
        const isCurrent = id === currentId
        if (filled !== undefined) {
          return (
            <td key={id} className={`${styles.cell} ${isCurrent ? styles.currentCol : ''}`}>
              <span className={styles.score}>{filled}</span>
            </td>
          )
        }
        if (isSelfColumn && previews) {
          return (
            <td
              key={id}
              className={`${styles.cell} ${styles.previewCell} ${isCurrent ? styles.currentCol : ''}`}
            >
              <button
                className={styles.preview}
                onClick={() => onScore(category)}
                title={`Score ${previews[category]} in ${CATEGORY_LABELS[category]}`}
              >
                {previews[category]}
              </button>
            </td>
          )
        }
        return (
          <td key={id} className={`${styles.cell} ${isCurrent ? styles.currentCol : ''}`}>
            <span className={styles.empty}>–</span>
          </td>
        )
      })}
    </tr>
  )

  const renderTotalRow = (
    label: string,
    getValue: (id: string) => number,
    variant: 'subtotal' | 'total'
  ) => (
    <tr className={variant === 'total' ? styles.totalRow : styles.subtotalRow}>
      <th scope="row" className={styles.rowHead}>
        {label}
      </th>
      {columns.map((id) => (
        <td key={id} className={`${styles.cell} ${id === currentId ? styles.currentCol : ''}`}>
          <span className={styles.score}>{getValue(id)}</span>
        </td>
      ))}
    </tr>
  )

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.corner}>Category</th>
            {columns.map((id) => (
              <th
                key={id}
                className={`${styles.playerHead} ${id === currentId ? styles.currentCol : ''}`}
              >
                <span className={styles.playerName}>
                  {nameById.get(id) ?? 'Player'}
                  {id === selfId ? <span className={styles.youTag}> (you)</span> : null}
                </span>
                {id === currentId ? <span className={styles.turnDot} aria-label="current turn" /> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className={styles.sectionRow}>
            <td colSpan={columns.length + 1}>Upper section</td>
          </tr>
          {UPPER_CATEGORIES.map(renderCategoryRow)}
          {renderTotalRow('Subtotal', (id) => totals[id].upperSubtotal, 'subtotal')}

          {/* Bonus row with a circular progress meter toward the +35 bonus. */}
          <tr className={styles.bonusRow}>
            <th scope="row" className={styles.rowHead}>
              <span className={styles.catLabel}>Upper bonus</span>
              <span className={styles.catHint}>+35 when subtotal reaches {UPPER_BONUS_THRESHOLD}</span>
            </th>
            {columns.map((id) => {
              const t = totals[id]
              const complete = t.upperBonus > 0
              return (
                <td key={id} className={`${styles.cell} ${id === currentId ? styles.currentCol : ''}`}>
                  <div className={styles.meterCell}>
                    <CircularMeter
                      value={t.upperSubtotal}
                      max={UPPER_BONUS_THRESHOLD}
                      complete={complete}
                      label={complete ? '+35' : String(t.upperSubtotal)}
                      title={`${t.upperSubtotal} / ${UPPER_BONUS_THRESHOLD} toward the +35 bonus`}
                    />
                  </div>
                </td>
              )
            })}
          </tr>

          <tr className={styles.sectionRow}>
            <td colSpan={columns.length + 1}>Lower section</td>
          </tr>
          {LOWER_CATEGORIES.map(renderCategoryRow)}
          {renderTotalRow('Total', (id) => totals[id].grandTotal, 'total')}
        </tbody>
      </table>
    </div>
  )
}
