import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts']
  }
})
