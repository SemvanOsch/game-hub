/**
 * Custom graphical icon for the Connect 4 home-screen card: the blue board with
 * circular sockets, a red and a yellow disc seated in it. Pure SVG — no emoji.
 */
export function Connect4Icon() {
  const cols = [10, 20, 30, 40]
  const rows = [16, 26, 36]
  // Which sockets hold a disc: [col, row] → colour.
  const filled: Record<string, string> = {
    '0,2': '#e23b3b',
    '1,2': '#f5c518',
    '0,1': '#f5c518',
    '1,1': '#e23b3b',
    '2,2': '#e23b3b'
  }
  return (
    <svg width="40" height="40" viewBox="0 0 50 52" fill="none" aria-hidden focusable="false">
      <defs>
        <radialGradient id="c4-red" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ff8080" />
          <stop offset="60%" stopColor="#e23b3b" />
          <stop offset="100%" stopColor="#b81f2b" />
        </radialGradient>
        <radialGradient id="c4-yellow" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ffe37a" />
          <stop offset="55%" stopColor="#f5c518" />
          <stop offset="100%" stopColor="#d29a08" />
        </radialGradient>
      </defs>
      <rect x="3" y="8" width="44" height="40" rx="7" fill="#2657ad" stroke="#1e478f" />
      {rows.map((cy, r) =>
        cols.map((cx, c) => {
          const hit = filled[`${c},${r}`]
          return (
            <circle
              key={`${c}-${r}`}
              cx={cx + 2}
              cy={cy}
              r="4.4"
              fill={
                hit === '#e23b3b'
                  ? 'url(#c4-red)'
                  : hit === '#f5c518'
                    ? 'url(#c4-yellow)'
                    : '#12203a'
              }
            />
          )
        })
      )}
    </svg>
  )
}
