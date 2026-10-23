import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3200);

/**
 * Browser acceptance tests run against a production build in explicit demo mode.
 * Shared-mode (PostgreSQL + Entra) browser flows need a real identity provider and
 * are covered by API integration tests instead; see docs/TEST_REPORT.md.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'da-DK',
    timezoneId: 'Europe/Copenhagen',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/today`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { APP_MODE: 'demo', NEXT_TELEMETRY_DISABLED: '1' },
  },
});
