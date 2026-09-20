/**
 * Visual configuration for the poker-chip components. The chip *values* and the
 * decomposition maths live in `@shared/chips/breakdown` (pure, tested); this file
 * only adds the presentation layer: colours, pixel sizes and stack geometry.
 *
 * Chip colours are fixed poker conventions (white/red/green/black/purple) and are
 * intentionally theme-independent — like the always-light playing cards, chips
 * read the same on the felt in every app theme. No game logic is tied to colour.
 */
import type { CSSProperties } from 'react'
import type { ChipDenomination } from '@shared/chips/breakdown'

export type ChipSize = 'small' | 'medium' | 'large'

/** Per-chip visual palette. Every chip prints its own value, so colour is only
 *  ever a secondary cue (never the sole carrier of the denomination). */
interface ChipStyle {
  /** Outer ring / body colour. */
  rim: string
  /** Inner face colour (a lighter disc sits on top via a gradient). */
  face: string
  /** Edge-spot and inner-ring colour (the little markings around the rim). */
  edge: string
  /** Denomination text colour. */
  ink: string
}

export const CHIP_STYLES: Record<ChipDenomination, ChipStyle> = {
  1: { rim: '#c3ccd8', face: '#eef2f8', edge: '#ffffff', ink: '#2a2f3a' },
  5: { rim: '#a5223a', face: '#d23b4e', edge: '#ffe3e7', ink: '#ffffff' },
  25: { rim: '#1c7048', face: '#2ba169', edge: '#e2fff0', ink: '#ffffff' },
  100: { rim: '#111318', face: '#2c313d', edge: '#cdd5e3', ink: '#ffffff' },
  500: { rim: '#563597', face: '#7b52c9', edge: '#ece0ff', ink: '#ffffff' }
}

/** Chip diameter in px per size. */
export const CHIP_DIAMETER: Record<ChipSize, number> = {
  small: 28,
  medium: 42,
  large: 58
}

/** Vertical peek between stacked chips (how much of a lower chip's rim shows). */
export const CHIP_STACK_STEP: Record<ChipSize, number> = {
  small: 6,
  medium: 9,
  large: 12
}

/** CSS custom properties that colour a single chip of the given denomination. */
export function chipColorVars(denomination: ChipDenomination): CSSProperties {
  const s = CHIP_STYLES[denomination]
  return {
    ['--chip-rim' as string]: s.rim,
    ['--chip-face' as string]: s.face,
    ['--chip-edge' as string]: s.edge,
    ['--chip-ink' as string]: s.ink
  }
}

/** A tiny, deterministic horizontal wobble (px) so a stack looks hand-placed. */
export function stackJitter(index: number): number {
  // Fixed cycle — subtle and stable across re-renders (no randomness).
  return [-0.9, 0.6, -0.4, 0.9][index % 4]
}
