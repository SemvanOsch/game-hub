import { SHIP_NAMES } from '@shared/battleships/types'
import type { BattleshipsView } from '@shared/battleships/view'

/**
 * Human-readable feedback for the most recent shot, from the local player's
 * perspective. Returns null when there is no shot yet.
 */
export function shotFeedback(view: BattleshipsView): string | null {
  const shot = view.lastShot
  if (!shot) return null
  const mine = shot.by === view.selfId
  const sunkName = shot.sunkShipType ? SHIP_NAMES[shot.sunkShipType] : null

  if (mine) {
    if (sunkName) return `You sunk their ${sunkName}!`
    return shot.result === 'hit' ? 'Hit!' : 'Miss!'
  }
  if (sunkName) return `Your ${sunkName} has been sunk!`
  return shot.result === 'hit' ? 'They hit your fleet!' : 'They missed!'
}

/** A stable key identifying a shot, for detecting when a new one arrives. */
export function shotKey(view: BattleshipsView): string {
  const shot = view.lastShot
  if (!shot) return ''
  return `${shot.by}:${shot.coordinate.row},${shot.coordinate.col}:${shot.result}`
}
