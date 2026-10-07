// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { codecovVitePlugin } from '@codecov/vite-plugin';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import { readBuildInfo } from './build/buildInfo.ts';
import { pwa } from './build/pwa.ts';

const buildInfo = readBuildInfo();

export default defineConfig({
  // Relative asset paths, so the build works from a sub-path (GitHub Pages)
  // or from a file:// URL (Electron).
  base: './',
  plugins: [
    react(),
    // Uploads bundle stats to Codecov for size reporting on pull requests.
    // Only runs where CODECOV_TOKEN is set (not locally or on fork PRs).
    codecovVitePlugin({
      enableBundleAnalysis: process.env['CODECOV_TOKEN'] !== undefined,
      bundleName: '14cux-gauge',
      ...(process.env['CODECOV_TOKEN'] && {
        uploadToken: process.env['CODECOV_TOKEN'],
      }),
      telemetry: false,
    }),
    pwa(buildInfo),
  ],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
  build: {
    // The GPL requires the corresponding source to be available; shipping
    // source maps alongside the bundle keeps it readable.
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Generous, as tests that render the whole app run in real time and a
    // busy CI runner is slow. A test that is right should never time out.
    testTimeout: 30_000,
    include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
    reporters: process.env['GITHUB_ACTIONS']
      ? ['default', 'github-actions', 'junit']
      : ['default', 'junit'],
    outputFile: {
      junit: './test-reports/junit.xml',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}', 'build/**/*.ts'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'build/**/*.test.ts',
        'src/test-setup.ts',
        // Helpers for the tests, not shipped in the app.
        'src/test-support/**',
        'src/main.tsx',
      ],
      // Floors, not targets: raise them as coverage improves; never lower
      // them to land a change.
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 95,
        branches: 80,
      },
    },
  },
});
