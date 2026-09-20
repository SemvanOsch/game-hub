import { SHIP_NAMES } from '@shared/battleships/types'
import { ABILITY_META } from '@shared/battleships/abilities'
import type { BattleshipsView } from '@shared/battleships/view'

/**
 * Human-readable feedback for the most recent event (normal shot OR ability),
 * from the local player's perspective. Returns null when nothing has happened
 * yet. Only one of `lastShot` / `lastAbility` is ever set per action.
 */
export function shotFeedback(view: BattleshipsView): string | null {
  if (view.lastAbility) return abilityFeedback(view)

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

/** Feedback line for the most recent ability resolution. */
function abilityFeedback(view: BattleshipsView): string | null {
  const ev = view.lastAbility
  if (!ev) return null
  const mine = ev.by === view.selfId
  const name = ABILITY_META[ev.ability].name
  const sunk = ev.sunkShipTypes.map((t) => SHIP_NAMES[t])
  const who = mine ? 'You fired' : 'They fired'
  const parts = [`${who} ${name} — ${ev.hits} hit${ev.hits === 1 ? '' : 's'}, ${ev.misses} miss${ev.misses === 1 ? '' : 'es'}`]
  if (sunk.length > 0) {
    parts.push(mine ? `sank ${sunk.join(', ')}!` : `${sunk.join(', ')} lost!`)
  }
  return parts.join(' · ')
}

/** A stable key identifying the latest event, for detecting when a new one arrives. */
export function shotKey(view: BattleshipsView): string {
  if (view.lastAbility) {
    const ev = view.lastAbility
    return `ability:${ev.by}:${ev.ability}:${ev.target.row},${ev.target.col}:${ev.hits}/${ev.misses}`
  }
  const shot = view.lastShot
  if (!shot) return ''
  return `${shot.by}:${shot.coordinate.row},${shot.coordinate.col}:${shot.result}`
}
