import type { FinalScore } from '@shared/yahtzee/engine'
import { GameOverScreen } from '../../screens/GameOverScreen'
import type { GameOverUIProps } from '../ui'

/** Adapts the generic game-over props to the existing Yahtzee results screen. */
export function YahtzeeResult({
  room,
  results,
  selfId,
  isHost,
  onPlayAgain,
  onHome
}: GameOverUIProps) {
  return (
    <GameOverScreen
      room={room}
      results={results as FinalScore[]}
      selfId={selfId}
      isHost={isHost}
      onPlayAgain={onPlayAgain}
      onHome={onHome}
    />
  )
}
