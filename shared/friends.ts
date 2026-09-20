/**
 * Pure head-to-head scoring shared by server and renderer.
 *
 * A "score" turns a list of per-game win/loss records into a single tally: for
 * each game, whoever has more wins earns one point; a tie in a game awards no
 * points to either side. Records are always from the local user's perspective
 * (see {@link GameRecord}), so `mine` is the local user's point total.
 */
import type { GameRecord } from './types'

export interface HeadToHeadScore {
  /** Points for the local user (games won more of than the friend). */
  mine: number
  /** Points for the friend (games they won more of). */
  theirs: number
}

/** Tally head-to-head points from a per-game win/loss list (see module docs). */
export function headToHeadScore(records: GameRecord[]): HeadToHeadScore {
  let mine = 0
  let theirs = 0
  for (const record of records) {
    if (record.wins > record.losses) mine++
    else if (record.losses > record.wins) theirs++
  }
  return { mine, theirs }
}
