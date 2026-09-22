/**
 * Zip puzzle generator (dev tool — not shipped/bundled).
 *
 * Produces a `PUZZLE_BANK` literal you can paste into `shared/zip/bank.ts`. It
 * reuses the exact same generation core the server uses at match start
 * (`shared/zip/generate.ts`), so bank puzzles and live puzzles are built and
 * verified identically.
 *
 * Usage (from the repo root):
 *   npm run gen:puzzles                 # defaults: 8 easy, 8 medium, 8 hard
 *   npm run gen:puzzles -- 20 20 20     # 20 of each tier
 *   npm run gen:puzzles -- 40 0 0       # 40 easy only
 *
 * Then copy the printed array over PUZZLE_BANK in shared/zip/bank.ts. Everything
 * is still guarded by bank.test.ts, which re-solves every puzzle in the bank.
 *
 * Tune grid sizes / checkpoint counts / wall counts in MATCH_TIERS
 * (shared/zip/generate.ts) — the same knobs the live generator uses.
 */
import { MATCH_TIERS, generatePuzzle, mulberry32 } from '../shared/zip/generate'
import type { ZipPuzzle } from '../shared/zip/puzzles'

const PREFIX: Record<string, string> = { easy: 'e', medium: 'm', hard: 'h' }

/** Stable signature so we never emit duplicate puzzles within a tier. */
function signature(p: ZipPuzzle): string {
  const cps = Object.entries(p.checkpoints)
    .map(([i, n]) => `${i}:${n}`)
    .sort()
    .join(',')
  const walls = p.walls
    .map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`))
    .sort()
    .join(',')
  return `${p.rows}x${p.cols}|${cps}|${walls}`
}

function toLiteral(p: ZipPuzzle): string {
  const cps = Object.entries(p.checkpoints)
    .sort((a, b) => a[1] - b[1])
    .map(([idx, n]) => `${idx}: ${n}`)
    .join(', ')
  const walls = p.walls.map(([a, b]) => `[${a}, ${b}]`).join(', ')
  return `  {
    id: '${p.id}',
    rows: ${p.rows},
    cols: ${p.cols},
    difficulty: '${p.difficulty}',
    checkpoints: { ${cps} },
    walls: [${walls}]
  }`
}

const args = process.argv.slice(2).map((n) => Number(n))
const counts = MATCH_TIERS.map((_, i) => (Number.isFinite(args[i]) ? args[i] : 8))

const all: ZipPuzzle[] = []
MATCH_TIERS.forEach((spec, tierIndex) => {
  const want = counts[tierIndex]
  const prefix = PREFIX[spec.difficulty] ?? spec.difficulty[0]
  const seen = new Set<string>()
  const tier: ZipPuzzle[] = []
  let seed = (tierIndex + 1) * 100_000 + 7
  let guard = 0
  while (tier.length < want && guard < want * 400 + 2000) {
    guard++
    const puzzle = generatePuzzle(spec, `${prefix}${tier.length + 1}`, mulberry32(seed++), {
      preferUnique: true
    })
    if (!puzzle) continue
    const sig = signature(puzzle)
    if (seen.has(sig)) continue
    seen.add(sig)
    tier.push(puzzle)
  }
  if (tier.length < want) {
    console.error(`⚠ ${spec.difficulty}: only generated ${tier.length}/${want}`)
  } else {
    console.error(`✓ ${spec.difficulty}: ${tier.length} puzzles`)
  }
  all.push(...tier)
})

console.log("import type { ZipPuzzle } from './puzzles'\n")
console.log('export const PUZZLE_BANK: ZipPuzzle[] = [')
console.log(all.map(toLiteral).join(',\n'))
console.log(']')
