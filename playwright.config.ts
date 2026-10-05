// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { defineConfig, devices } from '@playwright/test';

// The acceptance suite runs against the production build in `dist/`, served
// from the same sub-path GitHub Pages uses, so it tests exactly what ships.
// Build first (`npm run build`), or in CI download the release's `dist/`.
const CI = Boolean(process.env['CI']);
const PORT = 4173;
const BASE_PATH = '/14cux-gauge/';
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-reports/e2e/results',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: CI,
  // A retry captures a trace of the failure; failOnFlakyTests still fails
  // the run, so a flaky test cannot let a release through.
  retries: CI ? 1 : 0,
  failOnFlakyTests: CI,
  reporter: CI
    ? [
        ['github'],
        ['list'],
        ['html', { open: 'never', outputFolder: 'test-reports/e2e/html' }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: 'test-reports/e2e/html' }],
      ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npx vite preview --base ${BASE_PATH} --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !CI,
  },
});
