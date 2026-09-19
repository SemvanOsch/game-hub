import { useEffect, useRef, useState } from 'react'
import type { RoomState } from '@shared/types'
import type { Category } from '@shared/yahtzee/categories'
import { MAX_ROLLS } from '@shared/yahtzee/dice'
import type { YahtzeeGameState } from '@shared/yahtzee/engine'
import { Die } from '../components/Die'
import { Scorecard } from '../components/Scorecard'
import { Button } from '../components/Button'
import styles from './GameScreen.module.css'

interface GameScreenProps {
  room: RoomState
  game: YahtzeeGameState
  selfId: string
  isMyTurn: boolean
  onRoll: () => void
  onKeepDie: (index: number) => void
  onScore: (category: Category) => void
  onLeave: () => void
}

export function GameScreen({
  room,
  game,
  selfId,
  isMyTurn,
  onRoll,
  onKeepDie,
  onScore,
  onLeave
}: GameScreenProps) {
  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const currentId = game.playerOrder[game.currentPlayerIndex]
  const currentName = nameById.get(currentId) ?? 'Player'
  const rollsLeft = MAX_ROLLS - game.rollsUsed
  const canRoll = isMyTurn && game.rollsUsed < MAX_ROLLS

  // Play the tumble animation on dice that were just (re)rolled.
  const [spinning, setSpinning] = useState<boolean[]>(() => game.dice.map(() => false))
  const prevRolls = useRef(game.rollsUsed)
  useEffect(() => {
    if (game.rollsUsed > prevRolls.current) {
      prevRolls.current = game.rollsUsed
      setSpinning(game.held.map((h) => !h))
      const timer = window.setTimeout(() => setSpinning(game.dice.map(() => false)), 560)
      return () => window.clearTimeout(timer)
    }
    prevRolls.current = game.rollsUsed
    return undefined
  }, [game.rollsUsed, game.held, game.dice])
  const canHold = isMyTurn && game.rollsUsed > 0 && game.rollsUsed < MAX_ROLLS
  const canScore = isMyTurn && game.rollsUsed > 0
  const totalRounds = 13

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave game
        </button>
        <span className={styles.round}>
          Round {Math.min(game.round, totalRounds)} / {totalRounds}
        </span>
      </div>

      <div
        className={[styles.turnBanner, isMyTurn ? styles.myTurn : styles.otherTurn].join(' ')}
      >
        {isMyTurn ? (
          <>
            <strong>Your turn</strong>
            <span>
              {game.rollsUsed === 0
                ? 'Roll the dice to begin.'
                : rollsLeft > 0
                  ? 'Hold dice and reroll, or pick a category to score.'
                  : 'No rolls left — pick a category to score.'}
            </span>
          </>
        ) : (
          <>
            <strong>{currentName}&rsquo;s turn</strong>
            <span>Waiting for them to play…</span>
          </>
        )}
      </div>

      <div className={styles.layout}>
        <section className={styles.tableArea} aria-label="Dice">
          <div className={styles.dice}>
            {game.dice.map((value, i) => (
              <Die
                key={i}
                value={value}
                held={game.held[i]}
                disabled={!canHold}
                rolling={spinning[i]}
                onClick={canHold ? () => onKeepDie(i) : undefined}
              />
            ))}
          </div>

          <div className={styles.controls}>
            <Button size="lg" onClick={onRoll} disabled={!canRoll}>
              {game.rollsUsed === 0 ? '🎲 Roll dice' : `🎲 Reroll (${rollsLeft} left)`}
            </Button>
            <div className={styles.rollDots} aria-label={`${rollsLeft} rolls remaining`}>
              {Array.from({ length: MAX_ROLLS }).map((_, i) => (
                <span
                  key={i}
                  className={[styles.dot, i < game.rollsUsed ? styles.dotUsed : ''].join(' ')}
                />
              ))}
              <span className={styles.rollsText}>
                {game.rollsUsed}/{MAX_ROLLS} rolls used
              </span>
            </div>
            {canHold ? (
              <p className={styles.hint}>Click a die to hold it before rerolling.</p>
            ) : null}
          </div>
        </section>

        <section className={styles.scoreArea} aria-label="Scorecard">
          <Scorecard
            game={game}
            players={room.players}
            selfId={selfId}
            canScore={canScore}
            onScore={onScore}
          />
        </section>
      </div>
    </div>
  )
}
