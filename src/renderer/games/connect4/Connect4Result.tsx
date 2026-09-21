import { useEffect, useState } from 'react'
import type { Connect4Results, Connect4View } from '@shared/connect4/view'
import { Button } from '../../components/Button'
import { Connect4Board } from './Connect4Board'
import { Connect4Disc } from './Connect4Disc'
import { Connect4PlayerPanel } from './Connect4PlayerPanel'
import type { GameOverUIProps } from '../ui'
import styles from './Connect4Result.module.css'
import gameStyles from './Connect4Game.module.css'

/**
 * Stages of the game-over reveal. The server declares the game over the instant
 * the final disc is placed, so we hold briefly on the board first — letting the
 * winning disc fall (`landing`) and the winning line light up (`celebrate`) —
 * before showing the results panel (`result`). Applies only when the game ended
 * on an actual final move (a normal win or a draw), not a disconnect.
 */
type RevealStage = 'landing' | 'celebrate' | 'result'
const LANDING_MS = 560
const CELEBRATE_MS = 900

export function Connect4Result({
  room,
  view,
  results,
  selfId,
  isHost,
  onPlayAgain,
  onHome
}: GameOverUIProps) {
  const state = view as Connect4View
  const { winnerId, draw } = results as Connect4Results

  const nameById = new Map(room.players.map((p) => [p.id, p.name]))
  const myName = nameById.get(selfId) ?? 'You'
  const opponentName = (state.opponentId && nameById.get(state.opponentId)) || 'Opponent'
  const won = !draw && winnerId === selfId
  const winnerName = winnerId ? nameById.get(winnerId) ?? 'A player' : null
  const winnerColor = winnerId ? state.players.find((p) => p.id === winnerId)?.color ?? null : null

  const heading = draw ? 'Draw' : won ? 'You win!' : `${winnerName} wins!`

  // Only replay the landing when the game ended on a real final move (win/draw),
  // and only if we actually have that move to animate. A disconnect win jumps
  // straight to the panel.
  const hasLandingMove = Boolean(state.lastMove) && (Boolean(state.winningCells) || draw)
  const [stage, setStage] = useState<RevealStage>(hasLandingMove ? 'landing' : 'result')

  useEffect(() => {
    if (!hasLandingMove) return
    const t1 = window.setTimeout(() => setStage('celebrate'), LANDING_MS)
    const t2 = window.setTimeout(() => setStage('result'), LANDING_MS + CELEBRATE_MS)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [hasLandingMove])

  if (stage !== 'result') {
    // Hold on the board, mirroring the in-game layout (header, banner, player
    // panel, board) so nothing shifts: the final disc drops, then the winning
    // line lights up, before the results panel takes over.
    const myColor = state.yourColor ?? 'red'
    const opponentColor =
      state.players.find((p) => p.id === state.opponentId)?.color ?? 'yellow'
    const landingSub = draw
      ? 'Board full — no four-in-a-row.'
      : won
        ? 'You connected four in a row.'
        : `${winnerName} connected four in a row.`
    return (
      <div className={gameStyles.screen}>
        <div className={gameStyles.header}>
          <div className={gameStyles.spacer} aria-hidden />
          <h1 className={gameStyles.title}>Connect 4</h1>
          <div className={gameStyles.spacer} aria-hidden />
        </div>

        <div className={[gameStyles.banner, won ? gameStyles.you : gameStyles.other].join(' ')}>
          <strong className={gameStyles.headline}>{heading}</strong>
          <span className={gameStyles.sub}>{landingSub}</span>
        </div>

        <Connect4PlayerPanel
          you={{
            name: myName,
            color: myColor,
            isYou: true,
            active: winnerId === selfId,
            connected: true
          }}
          opponent={{
            name: opponentName,
            color: opponentColor,
            isYou: false,
            active: winnerId === state.opponentId,
            connected: true
          }}
        />

        <div className={gameStyles.boardArea}>
          <Connect4Board
            board={state.board}
            dropAnim={stage === 'landing' ? state.lastMove : null}
            winningCells={stage === 'celebrate' ? state.winningCells : undefined}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <h1 className={[styles.outcome, draw ? styles.draw : won ? styles.victory : styles.defeat].join(' ')}>
          {heading}
        </h1>
        <p className={styles.summary}>
          {draw
            ? 'Board full — no four-in-a-row.'
            : won
              ? 'You connected four in a row.'
              : `${winnerName} connected four in a row.`}
        </p>

        <div className={styles.players}>
          <PlayerLine
            name={myName + (selfId === winnerId ? '' : '')}
            you
            color={state.yourColor ?? 'red'}
          />
          <span className={styles.vs}>vs</span>
          <PlayerLine
            name={opponentName}
            color={state.players.find((p) => p.id === state.opponentId)?.color ?? 'yellow'}
          />
        </div>

        {!draw && winnerColor ? (
          <p className={styles.winnerNote}>
            <span className={styles.inlineDisc}>
              <Connect4Disc player={winnerColor} />
            </span>
            {winnerName} · {winnerColor === 'red' ? 'Red' : 'Yellow'}
          </p>
        ) : null}

        <div className={styles.boardArea}>
          <Connect4Board board={state.board} winningCells={state.winningCells} />
        </div>

        <div className={styles.actions}>
          {isHost ? (
            <Button size="lg" onClick={onPlayAgain}>
              Play again
            </Button>
          ) : (
            <span className={styles.hostNote}>Waiting for the host to start a rematch…</span>
          )}
          <Button size="lg" variant="secondary" onClick={onHome}>
            Return to Home
          </Button>
        </div>
      </div>
    </div>
  )
}

function PlayerLine({
  name,
  color,
  you = false
}: {
  name: string
  color: 'red' | 'yellow'
  you?: boolean
}) {
  return (
    <span className={styles.playerLine}>
      <span className={styles.lineDisc}>
        <Connect4Disc player={color} />
      </span>
      <span className={styles.playerName}>
        {name}
        {you ? <span className={styles.you}> (You)</span> : null}
      </span>
    </span>
  )
}
