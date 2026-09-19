import { useState } from 'react'
import { useProfileStore } from './store/profileStore'
import {
  selectIsHost,
  selectIsMyTurn,
  useMultiplayerStore
} from './store/multiplayerStore'
import type { GameDefinition } from './games/registry'
import { TopBar } from './components/TopBar'
import { Toast } from './components/Toast'
import { NameDialog } from './components/NameDialog'
import { Spinner } from './components/Spinner'
import { HomeScreen } from './screens/HomeScreen'
import { YahtzeeMenu } from './screens/YahtzeeMenu'
import { JoinScreen } from './screens/JoinScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { GameScreen } from './screens/GameScreen'
import { GameOverScreen } from './screens/GameOverScreen'
import styles from './App.module.css'

type LauncherView = 'home' | 'menu' | 'join'

export function App() {
  const name = useProfileStore((s) => s.name)
  const hasName = useProfileStore((s) => s.hasName)

  const store = useMultiplayerStore()
  const isHost = useMultiplayerStore(selectIsHost)
  const isMyTurn = useMultiplayerStore(selectIsMyTurn)

  const [view, setView] = useState<LauncherView>('home')
  const [selectedGame, setSelectedGame] = useState<GameDefinition | null>(null)

  const connecting = store.connectionStatus === 'connecting'

  const selectGame = (game: GameDefinition) => {
    setSelectedGame(game)
    setView('menu')
  }

  const host = () => {
    if (!selectedGame) return
    store.host(name, selectedGame.id).catch(() => {
      /* error surfaced via store.error / toast */
    })
  }

  const join = (code: string) => {
    store.join(code, name).catch(() => {
      /* error surfaced via store.error / toast */
    })
  }

  const leaveToMenu = () => {
    store.leave()
    setView(selectedGame ? 'menu' : 'home')
  }

  const leaveToHome = () => {
    store.leave()
    setView('home')
  }

  return (
    <>
      <TopBar />
      <main className={styles.content}>{renderScreen()}</main>

      <Toast message={store.error} onDismiss={store.clearError} />
      <NameDialog open={!hasName} required />

      {connecting ? (
        <div className={styles.overlay}>
          <Spinner label="Connecting to server…" />
        </div>
      ) : null}
    </>
  )

  function renderScreen() {
    // Once we're in a room, the network state drives the screen.
    if (store.room && store.selfId) {
      if (store.results && store.room.status === 'finished') {
        return (
          <GameOverScreen
            room={store.room}
            results={store.results}
            selfId={store.selfId}
            isHost={isHost}
            onPlayAgain={store.returnToLobby}
            onHome={leaveToHome}
          />
        )
      }
      if (store.game && store.room.status === 'in-game') {
        return (
          <GameScreen
            room={store.room}
            game={store.game}
            selfId={store.selfId}
            isMyTurn={isMyTurn}
            onRoll={store.rollDice}
            onKeepDie={store.keepDie}
            onScore={store.submitScore}
            onLeave={leaveToMenu}
          />
        )
      }
      return (
        <LobbyScreen
          room={store.room}
          selfId={store.selfId}
          isHost={isHost}
          onStart={store.startGame}
          onLeave={leaveToMenu}
        />
      )
    }

    // Otherwise show the launcher navigation.
    if (view === 'menu' && selectedGame) {
      return (
        <YahtzeeMenu
          game={selectedGame}
          connecting={connecting}
          onHost={host}
          onJoin={() => setView('join')}
          onBack={() => setView('home')}
        />
      )
    }
    if (view === 'join') {
      return <JoinScreen connecting={connecting} onJoin={join} onBack={() => setView('menu')} />
    }
    return <HomeScreen onSelectGame={selectGame} />
  }
}
