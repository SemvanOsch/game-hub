import { useProfileStore } from '../store/profileStore'
import { GAMES, type GameDefinition } from '../games/registry'
import { Button } from '../components/Button'
import styles from './HomeScreen.module.css'

interface HomeScreenProps {
  onSelectGame: (game: GameDefinition) => void
}

export function HomeScreen({ onSelectGame }: HomeScreenProps) {
  const name = useProfileStore((s) => s.name)

  return (
    <div className={styles.screen}>
      <div className={styles.hero}>
        <p className={styles.greeting}>Welcome back,</p>
        <h1 className={styles.name}>{name || 'Player'}</h1>
        <p className={styles.subtitle}>Pick a game to host or join a match with friends.</p>
      </div>

      <section aria-labelledby="games-heading">
        <div className={styles.sectionHeader}>
          <h2 id="games-heading">Games</h2>
          <span className={styles.count}>
            {GAMES.filter((g) => g.available).length} available
          </span>
        </div>

        <div className={styles.grid}>
          {GAMES.map((game) => (
            <GameCard key={game.id} game={game} onPlay={() => onSelectGame(game)} />
          ))}
        </div>
      </section>
    </div>
  )
}

function GameCard({ game, onPlay }: { game: GameDefinition; onPlay: () => void }) {
  return (
    <article className={styles.card}>
      <div className={styles.icon} aria-hidden>
        {game.Icon ? <game.Icon /> : game.icon}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <h3>{game.name}</h3>
          {game.multiplayer ? (
            <span className={styles.badge}>
              {game.minPlayers}–{game.maxPlayers} players
            </span>
          ) : null}
        </div>
        <p className={styles.desc}>{game.description}</p>
      </div>
      <div className={styles.cardFooter}>
        <Button onClick={onPlay} disabled={!game.available} fullWidth>
          {game.available ? 'Play' : 'Coming soon'}
        </Button>
      </div>
    </article>
  )
}
