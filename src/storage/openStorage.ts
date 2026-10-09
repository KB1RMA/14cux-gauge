// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { openDatabase } from './database';
import { IndexedDbRomStore } from './indexedDbRomStore';
import { IndexedDbSessionStore } from './indexedDbSessionStore';
import { MemoryRomStore, type RomStore } from './romStore';
import { MemorySessionStore, type SessionStore } from './sessionStore';

/** Where recorded sessions and saved ROM images are kept. */
export interface AppStorage {
  sessions: SessionStore;
  roms: RomStore;
  /**
   * Whether sessions and images outlive the page. Both are kept in the same
   * place, so they always both are, or both are not.
   */
  persistent: boolean;
  /** Releases the storage; the stores must not be used afterwards. */
  close(): void;
}

/**
 * Stores that keep sessions and images in memory only, for this visit: the
 * fallback when no persistent storage is available.
 */
export function memoryStorage(): AppStorage {
  return {
    sessions: new MemorySessionStore(),
    roms: new MemoryRomStore(),
    persistent: false,
    close: () => undefined,
  };
}

/**
 * Opens the best storage available: IndexedDB, or memory if it is missing
 * or refuses to open (some private windows, blocked site data). Memory keeps
 * recording and ROM reads working for the visit.
 *
 * The Electron app can supply its own `AppStorage` (files on disk, over IPC)
 * instead of calling this.
 */
export async function openStorage(
  factory: IDBFactory | undefined = globalThis.indexedDB as
    IDBFactory | undefined,
): Promise<AppStorage> {
  if (factory) {
    try {
      const db = await openDatabase({ factory });

      return {
        sessions: new IndexedDbSessionStore(db),
        roms: new IndexedDbRomStore(db),
        persistent: true,
        close: () => {
          db.close();
        },
      };
    } catch {
      // Fall through to memory.
    }
  }

  return memoryStorage();
}
