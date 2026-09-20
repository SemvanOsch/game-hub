/**
 * Custom graphical icon for the Rummikub home-screen card: three overlapping
 * numbered tiles in the four game colours. Pure SVG (no emoji), theme-aware via
 * the shared colour tokens where sensible.
 */
export function RummikubIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden focusable="false">
      {/* Back tile — orange 12 */}
      <g transform="rotate(-12 16 26)">
        <rect x="4" y="14" width="18" height="24" rx="4" fill="#f0f3fa" stroke="#c8cfdc" />
        <text
          x="13"
          y="30"
          textAnchor="middle"
          fontSize="15"
          fontWeight="700"
          fontFamily="'Segoe UI', system-ui, sans-serif"
          fill="#e6852b"
        >
          12
        </text>
      </g>
      {/* Middle tile — red 7 */}
      <g transform="rotate(3 24 24)">
        <rect x="15" y="10" width="18" height="24" rx="4" fill="#ffffff" stroke="#c8cfdc" />
        <text
          x="24"
          y="27"
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          fontFamily="'Segoe UI', system-ui, sans-serif"
          fill="#d63b47"
        >
          7
        </text>
      </g>
      {/* Front tile — blue 9 */}
      <g transform="rotate(14 34 22)">
        <rect x="26" y="14" width="18" height="24" rx="4" fill="#f0f3fa" stroke="#c8cfdc" />
        <text
          x="35"
          y="31"
          textAnchor="middle"
          fontSize="15"
          fontWeight="700"
          fontFamily="'Segoe UI', system-ui, sans-serif"
          fill="#2f6fd0"
        >
          9
        </text>
      </g>
    </svg>
  )
}
