import { forwardRef, type InputHTMLAttributes } from 'react'
import styles from './TextField.module.css'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, className, id, ...rest },
  ref
) {
  const inputId = id ?? rest.name ?? label
  return (
    <label className={styles.field} htmlFor={inputId}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <input
        id={inputId}
        ref={ref}
        className={[styles.input, className ?? ''].filter(Boolean).join(' ')}
        {...rest}
      />
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  )
})
