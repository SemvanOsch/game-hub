import { useEffect, useMemo, useRef, useState } from 'react'
import type { QueensView } from '@shared/queens/view'
import { findConflicts } from '@shared/queens/validate'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import type { GameUIProps } from '../ui'
import { QueensBoard } from './QueensBoard'
import { QueensLeaderboard } from './QueensLeaderboard'
import { formatTime, isLocallyComplete, ordinal } from './board'
import styles from './QueensGame.module.css'

/**
 * Queens Battle Royale in-match screen. Handles the live round (with a pre-round
 * countdown, a local timer synced to the server clock, and click-to-place solving)
 * and the between-round results screen. The final results are a separate game-over
 * screen (`QueensResult`). Everything authoritative — official times, placement,
 * points, round transitions — comes from the server `view`; the local placement and
 * timer are presentation only.
 */
export function QueensGame({ room, view, selfId, sendAction, onLeave }: GameUIProps) {
  const state = view as QueensView
  const nameById = useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players])
  const connectedById = useMemo(
    () => new Map(room.players.map((p) => [p.id, p.connected])),
    [room.players]
  )
  const disconnected = useMemo(
    () =>
      new Set(
        state.leaderboard
          .filter((r) => connectedById.get(r.playerId) === false)
          .map((r) => r.playerId)
      ),
    [state.leaderboard, connectedById]
  )
  // Live status per player (Solving / Finished / DNF) for the leaderboard — no
  // times, so it is safe to show during the round.
  const statusById = useMemo(() => {
    const m = new Map<string, 'solving' | 'finished' | 'dnf'>()
    for (const p of state.players) m.set(p.id, p.finished ? 'finished' : p.dnf ? 'dnf' : 'solving')
    return m
  }, [state.players])

  // Clock calibration: estimate the server/client offset from each view.
  const offsetRef = useRef(0)
  useEffect(() => {
    offsetRef.current = state.serverNow - Date.now()
  }, [state.serverNow])
  const serverNow = () => Date.now() + offsetRef.current

  const [queens, setQueens] = useState<number[]>([])
  const [marks, setMarks] = useState<number[]>([])
  const [pending, setPending] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)

  // Reset the board whenever a new round begins.
  useEffect(() => {
    setQueens([])
    setMarks([])
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

  const conflicts = useMemo(
    () => (puzzle ? findConflicts(puzzle, queens) : new Set<number>()),
    [puzzle, queens]
  )

  // Auto-submit as soon as a locally-complete, conflict-free board is built.
  useEffect(() => {
    if (!puzzle || !solving || pending) return
    if (isLocallyComplete(puzzle, queens)) {
      setPending(true)
      sendAction({ type: 'submit_solution', round: state.currentRound, queens })
    }
  }, [queens, puzzle, solving, pending, sendAction, state.currentRound])

  // While the server is generating this match's three puzzles.
  if (state.phase === 'generating' || !puzzle) {
    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <button className={styles.leave} onClick={onLeave}>
            ← Leave
          </button>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>♛ Queens Battle Royale</h1>
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

  const placed = queens.length
  const remaining = puzzle.size - placed
  const elapsed = state.self.finished
    ? state.self.completionMs ?? 0
    : Math.max(0, serverNow() - state.startAt)

  const isHost = state.hostId === selfId
  const lastRound = state.currentRound >= state.totalRounds - 1
  const timerText = state.self.dnf ? 'DNF' : formatTime(elapsed)

  // Progress hint while solving.
  const hint =
    placed < puzzle.size
      ? `Place ${remaining} more queen${remaining === 1 ? '' : 's'}`
      : conflicts.size > 0
        ? 'Fix the highlighted conflicts'
        : 'Checking…'

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.leave} onClick={onLeave}>
          ← Leave
        </button>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>♛ Queens Battle Royale</h1>
          <span className={styles.round}>
            Round {state.roundNumber} / {state.totalRounds} · {puzzle.difficulty}
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
      <QueensLeaderboard
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
                <strong className={styles.bannerTitle}>Solved!</strong>
                <span className={styles.time}>{formatTime(state.self.completionMs ?? 0)}</span>
                <span className={styles.sub}>Waiting for the other players…</span>
              </>
            ) : state.self.dnf ? (
              <>
                <strong className={styles.bannerTitle}>Time's up</strong>
                <span className={styles.sub}>You didn't finish in time.</span>
              </>
            ) : (
              <>
                <span className={styles.timer}>{timerText}</span>
                <span className={styles.sub}>{hint}</span>
              </>
            )}
          </div>

          <div className={styles.boardArea}>
            <QueensBoard
              puzzle={puzzle}
              queens={queens}
              marks={marks}
              onQueensChange={setQueens}
              onMarksChange={setMarks}
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
              <Button
                variant="secondary"
                onClick={() => {
                  setQueens([])
                  setMarks([])
                }}
                disabled={queens.length === 0 && marks.length === 0}
              >
                Clear board
              </Button>
              <span className={styles.rules}>
                One queen per row, column &amp; colour — none touching. Click to place, right-click
                to mark.
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
            <QueensLeaderboard
              rows={state.leaderboard}
              nameById={nameById}
              selfId={selfId}
              disconnected={disconnected}
              statusById={state.phase === 'active' ? statusById : undefined}
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
  players: QueensView['players']
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
            className={[styles.statusChip, disconnected.has(p.id) ? styles.chipGone : '']
              .filter(Boolean)
              .join(' ')}
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
  state: QueensView
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
            className={[styles.placeRow, p.playerId === selfId ? styles.placeSelf : '']
              .filter(Boolean)
              .join(' ')}
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

      <QueensLeaderboard
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
