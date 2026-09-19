import { useEffect, useState } from 'react'
import { useProfileStore } from './store/profileStore'
import { useAuthStore } from './store/authStore'
import { selectIsHost, useMultiplayerStore } from './store/multiplayerStore'
import type { GameDefinition } from './games/registry'
import { getGameUI } from './games/ui'
import { TopBar } from './components/TopBar'
import { Toast } from './components/Toast'
import { NameDialog } from './components/NameDialog'
import { Spinner } from './components/Spinner'
import { HomeScreen } from './screens/HomeScreen'
import { GameMenu } from './screens/GameMenu'
import { JoinScreen } from './screens/JoinScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { FriendsScreen } from './screens/FriendsScreen'
import styles from './App.module.css'

type LauncherView = 'home' | 'menu' | 'join' | 'friends'

export function App() {
  const name = useProfileStore((s) => s.name)
  const hasName = useProfileStore((s) => s.hasName)
  const session = useAuthStore((s) => s.session)
  const resume = useAuthStore((s) => s.resume)

  const store = useMultiplayerStore()
  const isHost = useMultiplayerStore(selectIsHost)

  const [view, setView] = useState<LauncherView>('home')
  const [selectedGame, setSelectedGame] = useState<GameDefinition | null>(null)

  // Restore a saved session once on launch (no-op for guests).
  useEffect(() => {
    resume()
  }, [resume])

  // The name used in games: the account username when logged in, else the guest name.
  const playerName = session?.username ?? name
  const connecting = store.connectionStatus === 'connecting'

  const selectGame = (game: GameDefinition) => {
    setSelectedGame(game)
    setView('menu')
  }

  const host = () => {
    if (!selectedGame) return
    store.host(playerName, selectedGame.id).catch(() => {
      /* error surfaced via store.error / toast */
    })
  }

  const join = (code: string) => {
    store.join(code, playerName).catch(() => {
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
      <TopBar onOpenFriends={() => setView('friends')} />
      <main className={styles.content}>{renderScreen()}</main>

      <Toast message={store.error} onDismiss={store.clearError} />
      {/* Guests must pick a name; logged-in users already have a username. */}
      <NameDialog open={!hasName && !session} required />

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
      const gameUI = store.gameId ? getGameUI(store.gameId) : undefined

      if (gameUI && store.results && store.room.status === 'finished') {
        const { GameOver } = gameUI
        return (
          <GameOver
            room={store.room}
            view={store.view}
            results={store.results}
            selfId={store.selfId}
            isHost={isHost}
            onPlayAgain={store.returnToLobby}
            onHome={leaveToHome}
          />
        )
      }
      if (gameUI && store.view && store.room.status === 'in-game') {
        const { Game } = gameUI
        return (
          <Game
            room={store.room}
            view={store.view}
            selfId={store.selfId}
            sendAction={store.sendAction}
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

    // Friends hub (only reachable while logged in).
    if (view === 'friends' && session) {
      return <FriendsScreen onBack={() => setView('home')} />
    }

    // Otherwise show the launcher navigation.
    if (view === 'menu' && selectedGame) {
      return (
        <GameMenu
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
