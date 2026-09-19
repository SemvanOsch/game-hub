/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MULTIPLAYER_SERVER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Mirror of the API exposed by the Electron preload script (window.api). */
interface ExposedApi {
  platform: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
}

declare global {
  interface Window {
    api?: ExposedApi
  }
}

export {}
