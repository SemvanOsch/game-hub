/**
 * Custom graphical icon for the Beverbende home-screen card: a row of four cards
 * with the two outer ones flipped up (the cards you get to memorise), echoing the
 * game's core setup. Pure SVG — no emoji, no copyrighted artwork.
 */
export function BeverbendeIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 50 50" fill="none" aria-hidden focusable="false">
      {/* Outer-left: face-up "0" (the best card) */}
      <g transform="rotate(-8 9 25)">
        <rect x="2" y="14" width="13" height="20" rx="3" fill="#1f8f7d" stroke="#11141c" strokeWidth="1.2" />
        <text x="8.5" y="27.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="Segoe UI, system-ui, sans-serif">
          0
        </text>
      </g>
      {/* Two middle: face-down (unknown) */}
      <rect x="15" y="15" width="13" height="20" rx="3" fill="#232d47" stroke="#11141c" strokeWidth="1.2" />
      <rect x="24" y="15" width="13" height="20" rx="3" fill="#232d47" stroke="#11141c" strokeWidth="1.2" />
      <circle cx="30.5" cy="25" r="3.4" fill="none" stroke="#5a6a92" strokeWidth="1.4" />
      {/* Outer-right: face-up "9" (the worst card) */}
      <g transform="rotate(8 41 25)">
        <rect x="35" y="14" width="13" height="20" rx="3" fill="#c6474c" stroke="#11141c" strokeWidth="1.2" />
        <text x="41.5" y="27.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="Segoe UI, system-ui, sans-serif">
          9
        </text>
      </g>
    </svg>
  )
}
