import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { Modal } from './Modal'
import { Button } from './Button'
import { TextField } from './TextField'

interface AuthDialogProps {
  open: boolean
  onClose: () => void
}

type Mode = 'login' | 'signup'

/** Login / sign-up dialog. Closes itself once a session is established. */
export function AuthDialog({ open, onClose }: AuthDialogProps) {
  const session = useAuthStore((s) => s.session)
  const pending = useAuthStore((s) => s.pending)
  const authError = useAuthStore((s) => s.authError)
  const login = useAuthStore((s) => s.login)
  const signup = useAuthStore((s) => s.signup)
  const clearAuthError = useAuthStore((s) => s.clearAuthError)

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Close automatically once we're logged in.
  useEffect(() => {
    if (open && session) onClose()
  }, [open, session, onClose])

  // Reset fields whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setUsername('')
      setPassword('')
      clearAuthError()
    }
  }, [open, clearAuthError])

  const busy = pending === 'login' || pending === 'signup'
  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy

  const submit = () => {
    if (!canSubmit) return
    if (mode === 'login') login(username.trim(), password)
    else signup(username.trim(), password)
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    clearAuthError()
  }

  return (
    <Modal open={open} title={mode === 'login' ? 'Log in' : 'Create an account'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            type="button"
            variant={mode === 'login' ? 'secondary' : 'ghost'}
            size="sm"
            fullWidth
            onClick={() => switchMode('login')}
          >
            Log in
          </Button>
          <Button
            type="button"
            variant={mode === 'signup' ? 'secondary' : 'ghost'}
            size="sm"
            fullWidth
            onClick={() => switchMode('signup')}
          >
            Sign up
          </Button>
        </div>

        <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
          {mode === 'login'
            ? 'Log in to see friends and your win/loss records.'
            : 'Create an account to add friends and track records across devices.'}
        </p>

        <TextField
          label="Username"
          name="username"
          autoFocus
          autoComplete="username"
          maxLength={24}
          placeholder="3–24 letters, numbers or _"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {authError ? (
          <p style={{ margin: 0, color: 'var(--danger, #e5484d)', fontSize: 13 }}>{authError}</p>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
