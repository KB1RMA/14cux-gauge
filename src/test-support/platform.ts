// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import type { Platform, SettingsBackend } from '../platform/platform';
import { storageWith } from './storage';

/** Settings kept in memory, as a desktop build might keep them in a file. */
export function memorySettings(): SettingsBackend {
  const stored = new Map<string, string>();

  return {
    defaults: () => ({ usageCounts: 'on' }),
    read: (key) => stored.get(key) ?? null,
    write: (key, value) => {
      const raw = JSON.stringify(value);

      stored.set(key, raw);

      return raw;
    },
    watch: () => () => undefined,
  };
}

/**
 * A platform for tests that touches nothing outside the test: one serial
 * port that leads to an emulated ECU (`SimulatedTransport`), files that are
 * accepted and dropped, memory storage and in-memory settings. Pass
 * `overrides` to swap a part.
 */
export function testPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    serial: {
      available: () => true,
      requestPort: () => Promise.resolve({ description: 'Test adapter' }),
      open: () => ({
        transport: new SimulatedTransport(),
        onLost: () => () => undefined,
      }),
    },
    files: { save: () => Promise.resolve('saved') },
    storage: { open: storageWith() },
    settings: memorySettings(),
    app: { userAgent: 'TestBrowser/1.0', reload: () => undefined },
    ...overrides,
  };
}
