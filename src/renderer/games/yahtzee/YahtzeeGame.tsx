import type { Category } from '@shared/yahtzee/categories'
import type { YahtzeeGameState } from '@shared/yahtzee/engine'
import { GameScreen } from '../../screens/GameScreen'
import type { GameUIProps } from '../ui'

/**
 * Adapts the generic multiplayer UI props to the existing Yahtzee GameScreen,
 * translating scoped actions into the generic `sendAction` protocol.
 */
export function YahtzeeGame({ room, view, selfId, sendAction, onLeave }: GameUIProps) {
  const game = view as YahtzeeGameState
  const isMyTurn =
    game.status === 'playing' && game.playerOrder[game.currentPlayerIndex] === selfId

  return (
    <GameScreen
      room={room}
      game={game}
      selfId={selfId}
      isMyTurn={isMyTurn}
      onRoll={() => sendAction({ kind: 'roll' })}
      onKeepDie={(index) => sendAction({ kind: 'keep', index })}
      onScore={(category: Category) => sendAction({ kind: 'score', category })}
      onLeave={onLeave}
    />
  )
}
