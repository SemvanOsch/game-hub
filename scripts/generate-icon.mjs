// Generates the desktop app icons from a source image.
// Usage: node scripts/generate-icon.mjs <source-image>
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = process.argv[2]
if (!source) {
  console.error('Provide a source image path.')
  process.exit(1)
}

const buildDir = resolve(root, 'build')
await mkdir(buildDir, { recursive: true })

// Master 1024x1024 PNG (electron-builder uses build/icon.png for other platforms
// and as the window icon in dev).
const master = resolve(buildDir, 'icon.png')
await sharp(source).resize(1024, 1024, { fit: 'cover' }).png().toFile(master)
console.log('wrote', master)

// Multi-resolution Windows .ico for the taskbar and installer.
const icoSizes = [256, 128, 64, 48, 32, 16]
const pngBuffers = await Promise.all(
  icoSizes.map((size) => sharp(source).resize(size, size, { fit: 'cover' }).png().toBuffer())
)
const ico = await pngToIco(pngBuffers)
const icoPath = resolve(buildDir, 'icon.ico')
await writeFile(icoPath, ico)
console.log('wrote', icoPath, `(${icoSizes.join(', ')})`)
