const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.CLIENT_BASE_URL || 'http://127.0.0.1:3000',
    extraHTTPHeaders: { 'x-forwarded-proto': 'https' },
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure'
  }
});
