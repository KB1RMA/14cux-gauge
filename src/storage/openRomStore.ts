// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IndexedDbRomStore } from './indexedDbRomStore';
import { MemoryRomStore, type RomStore } from './romStore';

/**
 * Opens the best ROM store available: IndexedDB, or memory if it is missing
 * or refuses to open. `persistent` says whether images survive a reload.
 */
export async function openRomStore(
  factory: IDBFactory | undefined = globalThis.indexedDB as
    IDBFactory | undefined,
): Promise<{ store: RomStore; persistent: boolean }> {
  if (factory) {
    try {
      return {
        store: await IndexedDbRomStore.open({ factory }),
        persistent: true,
      };
    } catch {
      // Fall through to memory.
    }
  }

  return { store: new MemoryRomStore(), persistent: false };
}
