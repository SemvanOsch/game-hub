/**
 * Custom graphical icon for the UNO home-screen card: a small fan of the four
 * UNO colours with a central wild. Pure SVG — no emoji.
 */
export function UnoIcon() {
  const cards = [
    { x: 4, rot: -18, fill: '#e23b3f' },
    { x: 12, rot: -6, fill: '#f5b514' },
    { x: 20, rot: 6, fill: '#3fa34d' },
    { x: 28, rot: 18, fill: '#2c7fe0' }
  ]
  return (
    <svg width="40" height="40" viewBox="0 0 50 50" fill="none" aria-hidden focusable="false">
      <g transform="translate(1 8)">
        {cards.map((c, i) => (
          <g key={i} transform={`rotate(${c.rot} 22 30)`}>
            <rect x={c.x} y="6" width="16" height="24" rx="3" fill={c.fill} stroke="#11141c" strokeWidth="1" />
            <ellipse cx={c.x + 8} cy="18" rx="5.5" ry="8" fill="#f7f7f4" transform={`rotate(-38 ${c.x + 8} 18)`} />
          </g>
        ))}
      </g>
    </svg>
  )
}
