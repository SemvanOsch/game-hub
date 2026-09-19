/** Renderer runtime configuration. The multiplayer server URL comes from the
 *  VITE_MULTIPLAYER_SERVER_URL env var (see .env / .env.example). */
export const MULTIPLAYER_SERVER_URL =
  import.meta.env.VITE_MULTIPLAYER_SERVER_URL ?? 'ws://localhost:3001'
