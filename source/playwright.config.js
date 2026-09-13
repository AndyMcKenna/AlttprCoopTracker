'use strict';

// Browser tests for the board, against the real app on a real Postgres.
//
// Playwright starts the API itself (webServer below) and points it at the
// database in TRACKER_E2E_CONNECTION — by default a local Postgres with the
// stock password, which is what `docker run -e POSTGRES_PASSWORD=postgres
// -p 5432:5432 postgres:17` gives you and what CI provides as a service.
// The app migrates and seeds on startup, so the database only has to exist
// as a server; the tracker_e2e database is created on first run.

const { defineConfig, devices } = require('@playwright/test');

const port = 5240;
const connection =
  process.env.TRACKER_E2E_CONNECTION ||
  'Host=localhost;Port=5432;Database=tracker_e2e;Username=postgres;Password=postgres';

module.exports = defineConfig({
  testDir: 'e2e',
  // Every test makes its own room, so nothing shares state.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:' + port,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI has already built Release; locally dotnet run builds Debug itself.
    command: process.env.E2E_SERVER_COMMAND || 'dotnet run --project AlttpTracker.Api --no-launch-profile',
    url: 'http://localhost:' + port + '/api/gamedata',
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
    env: {
      ASPNETCORE_URLS: 'http://localhost:' + port,
      ASPNETCORE_ENVIRONMENT: 'Development',
      ConnectionStrings__tracker: connection,
      // Every test is one client address, and together they look like a
      // script; the caps are for scripts, not for this.
      RateLimits__ApiPerMinute: '100000',
      RateLimits__SocketsPerAddress: '1000',
    },
  },
});
