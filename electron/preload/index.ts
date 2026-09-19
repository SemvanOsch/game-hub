import { contextBridge } from 'electron'

/**
 * Minimal, explicitly whitelisted API surface exposed to the renderer.
 * No raw Node or ipcRenderer access is handed to React — only these fields.
 */
const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
}

export type ExposedApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // Fallback for the (non-default) case where context isolation is disabled.
  ;(globalThis as unknown as { api: ExposedApi }).api = api
}
