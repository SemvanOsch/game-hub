/**
 * Custom graphical icon for the Zip Battle Royale home-screen card: a small grid
 * with a numbered path zig-zagging through it. Pure SVG — no emoji — and it
 * follows the accent via currentColor-ish theme tokens where possible.
 */
export function ZipIcon() {
  // A 3×3 grid of cell centres.
  const xs = [12, 25, 38]
  const ys = [12, 25, 38]
  // A winding path through the cells (row,col order): 1 → … → end.
  const path = [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [1, 1],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2]
  ] as const
  const pts = path.map(([r, c]) => `${xs[c]},${ys[r]}`).join(' ')
  return (
    <svg width="40" height="40" viewBox="0 0 50 50" fill="none" aria-hidden focusable="false">
      <rect x="3" y="3" width="44" height="44" rx="9" fill="#1a1e26" stroke="#2c333f" />
      {ys.map((cy, r) =>
        xs.map((cx, c) => (
          <rect
            key={`${r}-${c}`}
            x={cx - 5.5}
            y={cy - 5.5}
            width="11"
            height="11"
            rx="3"
            fill="#222833"
            stroke="#2c333f"
          />
        ))
      )}
      <polyline
        points={pts}
        fill="none"
        stroke="#6d7cff"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* Start (1) and end (9) checkpoints. */}
      <circle cx={xs[0]} cy={ys[0]} r="6.5" fill="#6d7cff" />
      <text x={xs[0]} y={ys[0] + 3.4} fontSize="8" fontWeight="800" fill="#0b0d12" textAnchor="middle">
        1
      </text>
      <circle cx={xs[2]} cy={ys[2]} r="6.5" fill="#6d7cff" />
      <text x={xs[2]} y={ys[2] + 3.4} fontSize="8" fontWeight="800" fill="#0b0d12" textAnchor="middle">
        9
      </text>
    </svg>
  )
}
