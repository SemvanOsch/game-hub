/** Server configuration, sourced from environment variables.
 *  `PORT` is honored first because most cloud hosts (Render, Railway, Fly, …)
 *  inject it automatically. Falls back to MULTIPLAYER_SERVER_PORT, then 3001. */
export const config = {
  port: Number(process.env.PORT ?? process.env.MULTIPLAYER_SERVER_PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0'
}
