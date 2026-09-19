import { useState } from 'react'
import { useProfileStore } from '../store/profileStore'
import { Modal } from './Modal'
import { Button } from './Button'
import { TextField } from './TextField'
import { ThemePicker } from './ThemePicker'

interface NameDialogProps {
  open: boolean
  /** Required (first launch) dialogs cannot be dismissed without a name. */
  required?: boolean
  onClose?: () => void
}

export function NameDialog({ open, required = false, onClose }: NameDialogProps) {
  const currentName = useProfileStore((s) => s.name)
  const setName = useProfileStore((s) => s.setName)
  const [value, setValue] = useState(currentName)

  const trimmed = value.trim()
  const canSave = trimmed.length > 0

  const submit = () => {
    if (!canSave) return
    setName(trimmed)
    onClose?.()
  }

  return (
    <Modal
      open={open}
      title={required ? 'Welcome to Game Hub' : 'Settings'}
      onClose={required ? undefined : onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
            {required
              ? 'This name is shown to other players in multiplayer games. You can change it any time from the profile button.'
              : 'Pick the name other players will see.'}
          </p>
          <TextField
            label="Display name"
            name="displayName"
            autoFocus
            maxLength={24}
            placeholder="e.g. Dice Wizard"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>Theme</span>
          <ThemePicker />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          {!required ? (
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={!canSave}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
