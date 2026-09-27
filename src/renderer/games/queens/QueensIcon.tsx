/**
 * Custom graphical icon for the Queens Battle Royale home-screen card: a small
 * colour-region grid with a crown in one cell. Pure SVG — no emoji — echoing the
 * in-game board (distinct region colours + a queen glyph).
 */
export function QueensIcon() {
  // A 4×4 grid of region-coloured cells (ids drive the fill).
  const regions = [
    [0, 0, 1, 1],
    [2, 0, 1, 3],
    [2, 2, 3, 3],
    [2, 4, 4, 3]
  ]
  const colors = ['#e5738a', '#6d9eeb', '#8fbc7a', '#f2b45c', '#a988e6']
  const cell = 10
  const pad = 5
  return (
    <svg width="40" height="40" viewBox="0 0 50 50" fill="none" aria-hidden focusable="false">
      <rect x="3" y="3" width="44" height="44" rx="9" fill="#1a1e26" stroke="#2c333f" />
      {regions.map((rowArr, r) =>
        rowArr.map((region, c) => (
          <rect
            key={`${r}-${c}`}
            x={pad + c * cell}
            y={pad + r * cell}
            width={cell}
            height={cell}
            fill={colors[region]}
            stroke="#12151b"
            strokeWidth="1"
          />
        ))
      )}
      {/* Crown in cell (0,3). */}
      <g transform={`translate(${pad + 3 * cell + cell / 2} ${pad + 0 * cell + cell / 2})`}>
        <path
          d="M -3.4 -0.5 L -3.4 1.9 L 3.4 1.9 L 3.4 -0.5 L 1.9 0.5 L 0.7 -1.7 L 0 0 L -0.7 -1.7 L -1.9 0.5 Z"
          fill="#14171d"
        />
        <rect x="-3.6" y="2.1" width="7.2" height="1.1" rx="0.4" fill="#14171d" />
      </g>
    </svg>
  )
}
