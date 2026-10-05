// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IndexedDbSessionStore } from './indexedDbSessionStore';
import { MemorySessionStore, type SessionStore } from './sessionStore';

/**
 * Opens the best session store available: IndexedDB, or memory if it is
 * missing or refuses to open (some private windows, blocked site data). The
 * memory store keeps recording working for the visit; `persistent` says
 * whether recordings will survive a reload.
 *
 * The Electron app can supply its own `SessionStore` (files on disk, over
 * IPC) instead of calling this.
 */
export async function openSessionStore(
  factory: IDBFactory | undefined = globalThis.indexedDB as
    IDBFactory | undefined,
): Promise<{ store: SessionStore; persistent: boolean }> {
  if (factory) {
    try {
      return {
        store: await IndexedDbSessionStore.open({ factory }),
        persistent: true,
      };
    } catch {
      // Fall through to memory.
    }
  }

  return { store: new MemorySessionStore(), persistent: false };
}
