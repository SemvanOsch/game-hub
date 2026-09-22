import type { Card, Rank, Suit } from '@shared/blackjack/cards'
import { PlayingCard } from '../../components/cards/PlayingCard'
import styles from './CheatSheet.module.css'

const SUITS: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }
function c(notation: string): Card {
  const rankPart = notation.slice(0, notation.length - 1)
  const suitPart = notation[notation.length - 1]
  const rank = (rankPart === 'T' ? '10' : rankPart) as Rank
  return { rank, suit: SUITS[suitPart] }
}

interface CheatEntry {
  name: string
  cards: Card[]
  /** Which cards to visually emphasise (the ones forming the hand). */
  highlight: boolean[]
  description: string
}

/** All ten hand categories, strongest first, each with a real card example. */
const ENTRIES: CheatEntry[] = [
  {
    name: 'Royal Flush',
    cards: [c('As'), c('Ks'), c('Qs'), c('Js'), c('Ts')],
    highlight: [true, true, true, true, true],
    description: 'A, K, Q, J, 10 — all the same suit. The best possible hand.'
  },
  {
    name: 'Straight Flush',
    cards: [c('9h'), c('8h'), c('7h'), c('6h'), c('5h')],
    highlight: [true, true, true, true, true],
    description: 'Five cards in sequence, all the same suit.'
  },
  {
    name: 'Four of a Kind',
    cards: [c('7s'), c('7h'), c('7d'), c('7c'), c('Ks')],
    highlight: [true, true, true, true, false],
    description: 'All four cards of one rank.'
  },
  {
    name: 'Full House',
    cards: [c('Ks'), c('Kh'), c('Kd'), c('7c'), c('7s')],
    highlight: [true, true, true, true, true],
    description: 'Three of one rank plus a pair of another.'
  },
  {
    name: 'Flush',
    cards: [c('Ah'), c('Jh'), c('9h'), c('6h'), c('3h')],
    highlight: [true, true, true, true, true],
    description: 'Any five cards of the same suit.'
  },
  {
    name: 'Straight',
    cards: [c('9s'), c('8h'), c('7d'), c('6c'), c('5s')],
    highlight: [true, true, true, true, true],
    description: 'Five cards in sequence, mixed suits.'
  },
  {
    name: 'Three of a Kind',
    cards: [c('Qs'), c('Qh'), c('Qd'), c('9c'), c('2s')],
    highlight: [true, true, true, false, false],
    description: 'Three cards of the same rank.'
  },
  {
    name: 'Two Pair',
    cards: [c('Ks'), c('Kh'), c('7d'), c('7c'), c('As')],
    highlight: [true, true, true, true, false],
    description: 'Two cards of one rank plus two of another.'
  },
  {
    name: 'One Pair',
    cards: [c('Ts'), c('Th'), c('Ad'), c('8c'), c('4s')],
    highlight: [true, true, false, false, false],
    description: 'Two cards of the same rank.'
  },
  {
    name: 'High Card',
    cards: [c('Ad'), c('Jc'), c('9s'), c('6h'), c('2d')],
    highlight: [true, false, false, false, false],
    description: 'None of the above — the highest card plays.'
  }
]

/**
 * The poker hand cheat sheet. It sits beside the table (see the layout CSS) and
 * can be toggled open/closed on any screen size via the header button; the
 * caller owns the open state so the layout can reclaim the space when it is
 * collapsed. Every example uses the real {@link PlayingCard} component — no
 * unicode/emoji stand-ins.
 */
export function CheatSheet({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <aside className={[styles.sheet, open ? styles.open : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.toggle}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="poker-cheat-list"
      >
        <span>Hand rankings</span>
        <span className={styles.chevron} aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      <div className={styles.list} id="poker-cheat-list">

        <h2 className={styles.heading}>Poker Hands</h2>
        <p className={styles.sub}>Strongest to weakest</p>
        {ENTRIES.map((entry) => (
          <div key={entry.name} className={styles.entry}>
            <div className={styles.entryHead}>
              <span className={styles.entryName}>{entry.name}</span>
            </div>
            <div className={styles.cards} aria-hidden>
              {entry.cards.map((card, i) => (
                <PlayingCard
                  key={`${card.rank}${card.suit}`}
                  card={card}
                  size="sm"
                  className={entry.highlight[i] ? styles.hl : styles.dim}
                />
              ))}
            </div>
            <p className={styles.desc}>{entry.description}</p>
          </div>
        ))}
      </div>
    </aside>
  )
}
