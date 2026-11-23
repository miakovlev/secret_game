import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:4179',
    channel: process.env.PW_CHANNEL,
    viewport: { width: 1280, height: 880 },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179',
  },
})
