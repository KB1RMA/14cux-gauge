// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works from a sub-path (GitHub Pages)
  // or from a file:// URL (Electron).
  base: './',
  plugins: [react()],
  build: {
    // The GPL requires the corresponding source to be available; shipping
    // source maps alongside the bundle keeps it readable.
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    reporters: process.env['GITHUB_ACTIONS']
      ? ['default', 'github-actions']
      : ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-setup.ts', 'src/main.tsx'],
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
