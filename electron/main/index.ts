import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { setupAutoUpdate } from './updater'

const isDev = !app.isPackaged

// Display name used by Windows (taskbar/Task Manager grouping) and the menu.
app.setName('Game Hub')

const iconPath = join(__dirname, '../../build/icon.png')
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    title: 'Game Hub',
    // In dev the packaged icon isn't embedded yet, so point the window at it.
    ...(isDev ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security: keep the renderer sandboxed from Node.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.once('ready-to-show', () => window.show())

  // Open target=_blank / external links in the user's browser, not the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (isDev && devUrl) {
    window.loadURL(devUrl)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Ensures Windows groups the app (taskbar/Task Manager) under our identity.
  app.setAppUserModelId('com.example.gamehub')
  createWindow()
  setupAutoUpdate(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
