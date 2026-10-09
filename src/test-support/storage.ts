// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { AppStorage } from '../storage/openStorage';
import { MemoryRomStore, type RomStore } from '../storage/romStore';
import { MemorySessionStore, type SessionStore } from '../storage/sessionStore';

/**
 * Opens storage holding the given stores (memory ones for any left out), as
 * the `storage` of a platform given to `App`. Reported as persistent unless said.
 */
export function storageWith({
  sessions = new MemorySessionStore(),
  roms = new MemoryRomStore(),
  persistent = true,
}: {
  sessions?: SessionStore;
  roms?: RomStore;
  persistent?: boolean;
} = {}): () => Promise<AppStorage> {
  return () =>
    Promise.resolve({ sessions, roms, persistent, close: () => undefined });
}

/**
 * Makes `localStorage` throw on every access, as in a private window or with
 * site data blocked, until the test finishes, whether it passes or not.
 */
export function blockStorage(): void {
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };

  const spies = [
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail),
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail),
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(fail),
  ];

  onTestFinished(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
  });
}
