/**
 * Custom line-art ability icons — no emoji, no Unicode symbols. Each is a clean,
 * self-contained inline SVG using `currentColor` and a shared 24×24 viewBox and
 * stroke weight, so the three read as one cohesive tactical icon set. Bundled
 * locally with the app (no external URLs).
 */
import type { AbilityType } from '@shared/battleships/abilities'

interface IconProps {
  className?: string
  /** Pixel size (width & height). Defaults to 28. */
  size?: number
}

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const
}

/** Bombs — a round explosive charge with a lit fuse and a `+`-shaped spark. */
export function BombsIcon({ className, size = 28 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} {...BASE}>
      {/* charge body */}
      <circle cx="10.5" cy="15" r="6" />
      {/* highlight */}
      <path d="M8 12.5a3.5 3.5 0 0 1 2.5-1.7" opacity="0.7" />
      {/* cap + fuse */}
      <path d="M13.7 10.4l1.6-1.6" />
      <path d="M15.3 8.8c1-1 1.2-2.2 2.7-2.5" />
      {/* + shaped spark (ties to the plus-shaped blast) */}
      <path d="M19 3.2v2.4M17.8 4.4h2.4" />
    </svg>
  )
}

/** Scatter Missile — a missile trailing three diverging projectile paths. */
export function ScatterMissileIcon({ className, size = 28 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} {...BASE}>
      {/* missile body pointing up-right, with nose + tail fins */}
      <path d="M9 15l6.5-6.5c1.6-1.6 3.6-2 4.8-2 0 1.2-.4 3.2-2 4.8L11.8 12" />
      <path d="M18.2 5.8l.9-.9" />
      {/* fins at the tail */}
      <path d="M9 15l-2 .4 1.6-2.4M9 15l-.4 2 2.4-1.6" />
      {/* three diverging scatter trajectories */}
      <path d="M4 20l2.5-2.5" opacity="0.9" />
      <path d="M4.5 15.5l2 .4" opacity="0.65" />
      <path d="M8.5 20.5l.4-2" opacity="0.65" />
    </svg>
  )
}

/** Nuke — a stylized mushroom-cloud blast (nuclear, without the trefoil). */
export function NukeIcon({ className, size = 28 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} {...BASE}>
      {/* billowing cap */}
      <path d="M5 8.5c0-2.2 2-4 4-4 1 0 1.8.3 2.5.9.6-.6 1.5-.9 2.5-.9 2 0 3.5 1.6 3.5 3.6 0 .3 0 .6-.1.9 1 .3 1.6 1.2 1.6 2.2 0 1.3-1.1 2.3-2.4 2.3H6.4C5.1 13.5 4 12.5 4 11.2c0-1.2 1-2.2 2.2-2.3" />
      {/* stem */}
      <path d="M9.5 13.5c-.3 2 .2 4 1 5.5M14.5 13.5c.3 2-.2 4-1 5.5" />
      {/* ground shockwave */}
      <path d="M6 20h12" />
    </svg>
  )
}

const ICONS: Record<AbilityType, (props: IconProps) => JSX.Element> = {
  bombs: BombsIcon,
  scatter_missile: ScatterMissileIcon,
  nuke: NukeIcon
}

/** Render the icon for a given ability id. */
export function AbilityIcon({
  ability,
  className,
  size
}: IconProps & { ability: AbilityType }) {
  const Icon = ICONS[ability]
  return <Icon className={className} size={size} />
}
