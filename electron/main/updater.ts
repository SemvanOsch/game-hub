import { app, dialog, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

// electron-updater is CommonJS; destructure to stay compatible across builds.
const { autoUpdater } = electronUpdater

/**
 * Checks GitHub Releases for a newer version on launch and, if found,
 * downloads it in the background and offers to restart-and-install.
 * No-ops in dev (updates only make sense for the packaged, installed app).
 */
export function setupAutoUpdate(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', async (info) => {
    const options = {
      type: 'info' as const,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Game Hub ${info.version} is ready to install.`,
      detail:
        'Restart the app to apply the update now. Otherwise it will install automatically the next time you quit.'
    }
    const window = getWindow()
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options)
    if (result.response === 0) autoUpdater.quitAndInstall()
  })

  autoUpdater.on('error', (err) => {
    // Never surface update failures to the user; just log them.
    console.error('[updater] error:', err instanceof Error ? err.message : err)
  })

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[updater] check failed:', err instanceof Error ? err.message : err)
  })
}
