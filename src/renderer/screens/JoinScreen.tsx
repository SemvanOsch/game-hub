import { useState } from 'react'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'

interface JoinScreenProps {
  connecting: boolean
  onJoin: (code: string) => void
  onBack: () => void
}

export function JoinScreen({ connecting, onJoin, onBack }: JoinScreenProps) {
  const [code, setCode] = useState('')
  const normalized = code.trim().toUpperCase()
  const canJoin = normalized.length >= 4 && !connecting

  return (
    <Panel
      title="Join a game"
      subtitle="Enter the room code shared by the host."
      icon="🔑"
      onBack={onBack}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canJoin) onJoin(normalized)
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        <TextField
          label="Room code"
          name="roomCode"
          autoFocus
          autoCapitalize="characters"
          placeholder="e.g. K7P4Q"
          maxLength={5}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          style={{
            textTransform: 'uppercase',
            letterSpacing: '0.25em',
            fontFamily: 'var(--font-mono)',
            fontSize: 20,
            textAlign: 'center'
          }}
        />
        <Button type="submit" size="lg" fullWidth disabled={!canJoin}>
          {connecting ? 'Connecting…' : 'Join Game'}
        </Button>
      </form>
    </Panel>
  )
}
