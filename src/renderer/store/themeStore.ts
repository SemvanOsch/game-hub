import { create } from 'zustand'

export type ThemeId = 'purple' | 'red' | 'green' | 'blue' | 'light'

export interface ThemeOption {
  id: ThemeId
  label: string
  /** Preview swatch colors (not used for the actual theming, which lives in CSS). */
  bg: string
  accent: string
}

export const THEMES: ThemeOption[] = [
  { id: 'purple', label: 'Purple', bg: '#14171d', accent: '#6d7cff' },
  { id: 'red', label: 'Red', bg: '#14171d', accent: '#ff5d63' },
  { id: 'green', label: 'Green', bg: '#14171d', accent: '#35c98d' },
  { id: 'blue', label: 'Light Blue', bg: '#14171d', accent: '#38bdf8' },
  { id: 'light', label: 'Light', bg: '#ffffff', accent: '#5666f0' }
]

const STORAGE_KEY = 'game-hub:theme'
const DEFAULT: ThemeId = 'purple'

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

function loadTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isThemeId(stored)) return stored
  } catch {
    /* ignore */
  }
  return DEFAULT
}

/** Apply a theme by setting the data-theme attribute the CSS keys off of. */
function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
}

interface ThemeState {
  theme: ThemeId
  setTheme: (id: ThemeId) => void
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = loadTheme()
  applyTheme(initial)
  return {
    theme: initial,
    setTheme: (id) => {
      applyTheme(id)
      try {
        localStorage.setItem(STORAGE_KEY, id)
      } catch {
        /* ignore storage errors */
      }
      set({ theme: id })
    }
  }
})
