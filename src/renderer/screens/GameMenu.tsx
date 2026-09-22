import type { GameDefinition } from '../games/registry'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'

interface GameMenuProps {
  game: GameDefinition
  connecting: boolean
  onHost: () => void
  onJoin: () => void
  onBack: () => void
}

/** Host/Join menu for any registry game. Driven entirely by the game definition. */
export function GameMenu({ game, connecting, onHost, onJoin, onBack }: GameMenuProps) {
  return (
    <Panel
      title={game.name}
      icon={game.icon}
      onBack={onBack}
      backLabel="Home"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Button size="lg" fullWidth onClick={onHost} disabled={connecting}>
          Host Game
        </Button>
        <Button size="lg" variant="secondary" fullWidth onClick={onJoin} disabled={connecting}>
          Join Game
        </Button>
      </div>
    </Panel>
  )
}
