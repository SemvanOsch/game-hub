import { useEffect, useRef, useState } from 'react'

/** True when the user has asked the OS to reduce motion. Reactive to changes. */
export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(query).matches
      : false
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return
    const mq = window.matchMedia(query)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * Smoothly tween a displayed number toward `value` (ease-out), landing EXACTLY
 * on the target. Purely presentational: the caller always holds the true value,
 * and this only affects what is drawn between updates. Honours reduced-motion by
 * snapping immediately.
 *
 * The returned number is for display only — callers should still expose the real
 * `value` to assistive tech (e.g. via an aria-label), so the animation never
 * hides the authoritative amount.
 */
export function useCountUp(value: number, durationMs = 550): number {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(value)
  const displayRef = useRef(value)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    displayRef.current = display
  })

  useEffect(() => {
    if (reduced || durationMs <= 0) {
      setDisplay(value)
      return
    }
    const from = displayRef.current
    if (from === value) return
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      if (t >= 1) {
        setDisplay(value) // land exactly on the true value
        frameRef.current = null
      } else {
        setDisplay(from + (value - from) * eased)
        frameRef.current = requestAnimationFrame(step)
      }
    }
    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [value, durationMs, reduced])

  return display
}
