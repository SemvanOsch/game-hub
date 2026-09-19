import { create } from 'zustand'

const STORAGE_KEY = 'game-launcher:display-name'

function loadName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function persistName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name)
  } catch {
    /* ignore storage errors (e.g. private mode) */
  }
}

interface ProfileState {
  name: string
  /** True once the user has chosen a name at least once. */
  hasName: boolean
  setName: (name: string) => void
}

export const useProfileStore = create<ProfileState>((set) => {
  const initial = loadName()
  return {
    name: initial,
    hasName: initial.trim().length > 0,
    setName: (name: string) => {
      const trimmed = name.trim().slice(0, 24)
      persistName(trimmed)
      set({ name: trimmed, hasName: trimmed.length > 0 })
    }
  }
})
