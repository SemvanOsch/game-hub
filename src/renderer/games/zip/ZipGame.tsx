import { useEffect, useMemo, useRef, useState } from 'react'
import type { ZipView } from '@shared/zip/view'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import type { GameUIProps } from '../ui'
import { ZipBoard } from './ZipBoard'
import { ZipLeaderboard } from './ZipLeaderboard'
import { formatTime, isLocallyComplete, ordinal } from './board'
import styles from './ZipGame.module.css'

/**
 * Zip Battle Royale in-match screen. Handles the live round (with a pre-round
 * countdown, a local timer synced to the server clock, and pointer-drawn
 * solving) and the between-round results screen. The final results are a
 * separate game-over screen (`ZipResult`). Everything authoritative — official
 * times, placement, points, round transitions — comes from the server `view`;
 * the local path and timer are presentation only.
 */
export function ZipGame({ room, view, selfId, sendAction, onLeave }: GameUIProps) {
  const state = view as ZipView
  const nameById = useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players])
  const connectedById = useMemo(
    () => new Map(room.players.map((p) => [p.id, p.connected])),
    [room.players]
  )
  const disconnected = useMemo(
    () => new Set(state.leaderboard.filter((r) => connectedById.get(r.playerId) === false).map((r) => r.playerId)),
    [state.leaderboard, connectedById]
  )

  // Clock calibration: estimate the server/client offset from each view.
  const offsetRef = useRef(0)
  useEffect(() => {
    offsetRef.current = state.serverNow - Date.now()
  }, [state.serverNow])
  const serverNow = () => Date.now() + offsetRef.current

  const [localPath, setLocalPath] = useState<number[]>([])
  const [pending, setPending] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)

  // Reset the drawing whenever a new round begins.
  useEffect(() => {
    setLocalPath([])
    setPending(false)
  }, [state.currentRound])

  // A fresh view means the server processed our (or someone's) action.
  useEffect(() => {
    setPending(false)
  }, [view])

  // Drive the live timer / countdown.
  const [, setNowTick] = useState(0)
  useEffect(() => {
    if (state.phase !== 'active') return
    const id = window.setInterval(() => setNowTick((t) => t + 1), 50)
    return () => window.clearInterval(id)
  }, [state.phase])

  const puzzle = state.puzzle
  const started = serverNow() >= state.startAt
  const countdownLeft = Math.max(0, state.startAt - serverNow())
  const inCountdown = state.phase === 'active' && !started
  const solving = state.phase === 'active' && started && !state.self.finished && !state.self.dnf
  const interactive = solving && !pending

  // Auto-submit as soon as a locally-complete, valid path is drawn.
  useEffect(() => {
    if (!puzzle || !solving || pending) return
    if (isLocallyComplete(puzzle, localPath)) {
      setPending(true)
      sendAction({ type: 'submit_solution', round: state.currentRound, path: localPath })
    }
  }, [localPath, puzzle, solving, pending, sendAction, state.currentRound])

  // While the server is generating this match's three puzzles.
  if (state.phase === 'generating' || !puzzle) {
    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <button className={styles.leave} onClick={onLeave}>
            ← Leave
          </button>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>Zip Battle Royale</h1>
          </div>
          <div aria-hidden />
        </div>
        <div className={styles.generating}>
          <Spinner label="Generating puzzles…" />
          <p className={styles.sub}>Building three fresh puzzles for this match.</p>
        </div>
      </div>
    )
  }

  const totalCells = puzzle.rows * puzzle.cols
  const elapsed = state.self.finished
    ? state.self.completionMs ?? 0
    : Math.max(0, serverNow() - state.startAt)

  const isHost = state.hostId === selfId
  const lastRound = state.currentRound >= state.totalRounds - 1

  const timerText = state.self.dnf ? 'DNF' : formatTime(elapsed)

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave
        </button>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Zip Battle Royale</h1>
          <span className={styles.round}>
            Round {state.roundNumber} / {state.totalRounds}
          </span>
        </div>
        <button
          className={styles.lbToggle}
          onClick={() => setLeaderboardOpen((o) => !o)}
          aria-pressed={leaderboardOpen}
        >
          Leaderboard
        </button>
      </div>

      {/* Always-visible compact standings. */}
      <ZipLeaderboard
        rows={state.leaderboard}
        nameById={nameById}
        selfId={selfId}
        disconnected={disconnected}
        compact
      />

      {state.phase === 'active' ? (
        <>
          <div
            className={[
              styles.statusBanner,
              state.self.finished ? styles.done : state.self.dnf ? styles.dnf : styles.solving
            ].join(' ')}
          >
            {state.self.finished ? (
              <>
                <strong className={styles.bannerTitle}>Completed!</strong>
                <span className={styles.time}>{formatTime(state.self.completionMs ?? 0)}</span>
                <span className={styles.sub}>Waiting for other players…</span>
              </>
            ) : state.self.dnf ? (
              <>
                <strong className={styles.bannerTitle}>Time's up</strong>
                <span className={styles.sub}>You didn't finish in time.</span>
              </>
            ) : (
              <>
                <span className={styles.timer}>{timerText}</span>
                <span className={styles.sub}>
                  {localPath.length} / {totalCells} cells
                </span>
              </>
            )}
          </div>

          <div className={styles.boardArea}>
            <ZipBoard
              puzzle={puzzle}
              path={localPath}
              onChange={setLocalPath}
              interactive={interactive}
              locked={!solving}
            />
            {inCountdown ? (
              <div className={styles.countdown}>
                <span className={styles.countNumber}>
                  {countdownLeft > 0 ? Math.ceil(countdownLeft / 1000) : 'GO'}
                </span>
                <span className={styles.countHint}>Get ready…</span>
              </div>
            ) : null}
          </div>

          {solving ? (
            <div className={styles.controls}>
              <Button variant="secondary" onClick={() => setLocalPath([])} disabled={localPath.length === 0}>
                Reset path
              </Button>
              <span className={styles.hint}>
                Press cell 1 and drag through every square, hitting the numbers in order.
              </span>
            </div>
          ) : null}

          <PlayerStatusStrip
            players={state.players}
            nameById={nameById}
            selfId={selfId}
            disconnected={disconnected}
          />
        </>
      ) : (
        <RoundResults
          state={state}
          nameById={nameById}
          selfId={selfId}
          isHost={isHost}
          lastRound={lastRound}
          onAdvance={() => sendAction({ type: 'advance' })}
        />
      )}

      {leaderboardOpen ? (
        <div className={styles.overlay} onClick={() => setLeaderboardOpen(false)}>
          <div className={styles.overlayPanel} onClick={(e) => e.stopPropagation()}>
            <ZipLeaderboard
              rows={state.leaderboard}
              nameById={nameById}
              selfId={selfId}
              disconnected={disconnected}
              title="Standings"
            />
            <Button variant="secondary" fullWidth onClick={() => setLeaderboardOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PlayerStatusStrip({
  players,
  nameById,
  selfId,
  disconnected
}: {
  players: ZipView['players']
  nameById: Map<string, string>
  selfId: string
  disconnected: Set<string>
}) {
  return (
    <div className={styles.statusStrip}>
      {players.map((p) => {
        const label = p.finished ? 'Finished' : p.dnf ? 'DNF' : 'Solving…'
        const cls = p.finished ? styles.pDone : p.dnf ? styles.pDnf : styles.pSolving
        return (
          <div
            key={p.id}
            className={[styles.statusChip, disconnected.has(p.id) ? styles.chipGone : ''].filter(Boolean).join(' ')}
          >
            <span className={[styles.dot, cls].join(' ')} aria-hidden />
            <span className={styles.chipName}>
              {nameById.get(p.id) ?? 'Player'}
              {p.id === selfId ? ' (You)' : ''}
            </span>
            <span className={styles.chipStatus}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function RoundResults({
  state,
  nameById,
  selfId,
  isHost,
  lastRound,
  onAdvance
}: {
  state: ZipView
  nameById: Map<string, string>
  selfId: string
  isHost: boolean
  lastRound: boolean
  onAdvance: () => void
}) {
  const placements = state.roundResults ?? []
  return (
    <div className={styles.results}>
      <h2 className={styles.resultsTitle}>Round {state.roundNumber} Results</h2>
      <ol className={styles.placeList}>
        {placements.map((p) => (
          <li
            key={p.playerId}
            className={[styles.placeRow, p.playerId === selfId ? styles.placeSelf : ''].filter(Boolean).join(' ')}
          >
            <span className={styles.place}>{p.dnf ? '—' : ordinal(p.place)}</span>
            <span className={styles.placeName}>
              {nameById.get(p.playerId) ?? 'Player'}
              {p.playerId === selfId ? <span className={styles.you}> (You)</span> : null}
            </span>
            <span className={styles.placeTime}>{p.dnf ? 'DNF' : formatTime(p.completionMs ?? 0)}</span>
            <span className={styles.placePoints}>+{p.points}</span>
          </li>
        ))}
      </ol>

      <ZipLeaderboard
        rows={state.leaderboard}
        nameById={nameById}
        selfId={selfId}
        title="Total points"
      />

      <div className={styles.advance}>
        {isHost ? (
          <Button size="lg" onClick={onAdvance}>
            {lastRound ? 'View Final Results' : 'Next Round'}
          </Button>
        ) : (
          <span className={styles.waitHost}>
            Waiting for the host to continue{lastRound ? ' to the final results' : ''}…
          </span>
        )}
      </div>
    </div>
  )
}
