// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { openDatabase } from '../storage/database';

type StoreName = 'sessions' | 'chunks' | 'writes' | 'roms';

/**
 * Puts records into the app's database exactly as given, bypassing the
 * stores, as a damaged database or a newer version of the app might leave
 * them.
 */
export async function plantRecords(
  factory: IDBFactory,
  records: Partial<Record<StoreName, unknown[]>>,
): Promise<void> {
  const db = await openDatabase({ factory });
  const names = Object.keys(records) as StoreName[];
  const tx = db.transaction(names, 'readwrite');

  for (const name of names) {
    for (const record of records[name] ?? []) {
      tx.objectStore(name).put(record);
    }
  }

  await new Promise((resolve) => {
    tx.oncomplete = resolve;
  });
  db.close();
}
