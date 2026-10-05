// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

function currentCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return process.env['GITHUB_SHA'] ?? null;
  }
}

/**
 * Shown in the footer. release.yml sets RELEASE_TAG to the tag being
 * released; any other build is a development build. Returns a BuildInfo
 * (src/buildInfo.ts).
 */
function buildInfo() {
  const { version } = JSON.parse(
    readFileSync(new URL('package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  const releaseTag = process.env['RELEASE_TAG'] || null;

  if (releaseTag !== null && releaseTag !== `v${version}`) {
    throw new Error(
      `RELEASE_TAG ${releaseTag} does not match package.json version ${version}`,
    );
  }

  return { version, commit: currentCommit(), releaseTag };
}

export default defineConfig({
  // Relative asset paths, so the build works from a sub-path (GitHub Pages)
  // or from a file:// URL (Electron).
  base: './',
  plugins: [react()],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo()),
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
    include: ['src/**/*.test.{ts,tsx}'],
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
