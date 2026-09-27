/**
 * Custom graphical icon for the Skip-Bo home-screen card: a small stack of number
 * cards climbing 1→2→3 with a gold Skip-Bo wild on top. Pure SVG — no emoji.
 */
export function SkipBoIcon() {
  const cards = [
    { x: 3, y: 14, fill: '#3d6fd6', label: '1' },
    { x: 11, y: 10, fill: '#3aa657', label: '2' },
    { x: 19, y: 6, fill: '#d9772b', label: '3' }
  ]
  return (
    <svg width="40" height="40" viewBox="0 0 50 50" fill="none" aria-hidden focusable="false">
      {cards.map((c) => (
        <g key={c.label}>
          <rect x={c.x} y={c.y} width="18" height="26" rx="3" fill={c.fill} stroke="#11141c" strokeWidth="1.2" />
          <text
            x={c.x + 9}
            y={c.y + 18}
            textAnchor="middle"
            fontSize="13"
            fontWeight="800"
            fill="#fff"
            fontFamily="Segoe UI, system-ui, sans-serif"
          >
            {c.label}
          </text>
        </g>
      ))}
      {/* Gold Skip-Bo wild on top */}
      <g transform="rotate(10 34 12)">
        <rect x="27" y="2" width="18" height="26" rx="3" fill="#e6b23e" stroke="#11141c" strokeWidth="1.2" />
        <text
          x="36"
          y="17"
          textAnchor="middle"
          fontSize="8"
          fontWeight="900"
          fill="#2a1c05"
          fontFamily="Segoe UI, system-ui, sans-serif"
        >
          SB
        </text>
      </g>
    </svg>
  )
}
