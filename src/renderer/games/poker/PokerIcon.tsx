/**
 * Custom graphical icon for the Poker home-screen card: two overlapping playing
 * cards (an Ace and a King) with a chip peeking behind. Pure SVG — no emoji.
 */
export function PokerIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 52 52" fill="none" aria-hidden focusable="false">
      <defs>
        <radialGradient id="poker-chip" cx="40%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#e2556a" />
          <stop offset="60%" stopColor="#c23048" />
          <stop offset="100%" stopColor="#8f1f33" />
        </radialGradient>
      </defs>
      {/* Chip behind the cards */}
      <circle cx="35" cy="34" r="12" fill="url(#poker-chip)" stroke="#6f1526" strokeWidth="1.5" />
      <circle cx="35" cy="34" r="7.5" fill="none" stroke="#ffd9df" strokeWidth="1.4" strokeDasharray="2 3" />
      {/* Back card (King, tilted left) */}
      <g transform="rotate(-12 18 30)">
        <rect x="7" y="12" width="22" height="30" rx="3.5" fill="#fbfcff" stroke="#c7cede" />
        <text x="11" y="23" fontFamily="Georgia, serif" fontSize="10" fontWeight="700" fill="#1c2430">
          K
        </text>
        <text x="18" y="35" fontFamily="Georgia, serif" fontSize="13" fill="#1c2430">
          ♠
        </text>
      </g>
      {/* Front card (Ace of hearts, tilted right) */}
      <g transform="rotate(9 30 28)">
        <rect x="21" y="9" width="22" height="30" rx="3.5" fill="#ffffff" stroke="#c7cede" />
        <text x="25" y="20" fontFamily="Georgia, serif" fontSize="10" fontWeight="700" fill="#c0263c">
          A
        </text>
        <text x="31" y="33" fontFamily="Georgia, serif" fontSize="13" fill="#c0263c">
          ♥
        </text>
      </g>
    </svg>
  )
}
