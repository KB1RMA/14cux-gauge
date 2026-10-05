// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { access } from 'node:fs/promises';
import { build } from 'vite';
import {
  EMULATED_SERIAL_DIR,
  EMULATED_SERIAL_ENTRY,
  EMULATED_SERIAL_FILE,
} from './paths';

/**
 * Checks the production build exists and bundles the emulated serial port
 * into a script the tests inject into the page before the app loads.
 */
export default async function globalSetup(): Promise<void> {
  try {
    await access('dist/index.html');
  } catch {
    throw new Error(
      'dist/ is missing. Run `npm run build` before the acceptance suite.',
    );
  }

  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      lib: {
        entry: EMULATED_SERIAL_ENTRY,
        formats: ['iife'],
        name: 'emulatedSerial',
        fileName: () => EMULATED_SERIAL_FILE,
      },
      outDir: EMULATED_SERIAL_DIR,
      emptyOutDir: true,
      minify: false,
    },
  });
}
