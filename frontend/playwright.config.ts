import { defineConfig } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  // Functional geometry tests use reduced motion; fluid.spec.ts exercises full motion.
  use: { baseURL: 'http://127.0.0.1:8767', viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', trace: 'retain-on-failure' },
  webServer: {
    command: 'uv run python scripts/e2e_server.py',
    cwd: path.resolve(import.meta.dirname, '..'),
    url: 'http://127.0.0.1:8767/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
