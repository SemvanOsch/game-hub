import { THEMES, useThemeStore } from '../store/themeStore'
import styles from './ThemePicker.module.css'

/** Swatch grid for choosing the app color theme. Applies instantly. */
export function ThemePicker() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  return (
    <div className={styles.grid}>
      {THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          className={[styles.swatch, theme === option.id ? styles.active : ''].join(' ')}
          onClick={() => setTheme(option.id)}
          aria-pressed={theme === option.id}
          title={option.label}
        >
          <span className={styles.preview} style={{ background: option.bg }}>
            <span className={styles.dot} style={{ background: option.accent }} />
          </span>
          <span className={styles.name}>{option.label}</span>
        </button>
      ))}
    </div>
  )
}
