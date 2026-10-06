// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  completed,
  openDatabase,
  request,
  ROMS,
  type DatabaseOptions,
} from './database';
import {
  newestRomFirst,
  summaryOf,
  type NewRom,
  type RomStore,
  type RomSummary,
} from './romStore';

interface RomRecord extends RomSummary {
  bytes: Uint8Array;
}

/** ROM images in IndexedDB, one record each, bytes included. */
export class IndexedDbRomStore implements RomStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(options: DatabaseOptions = {}): Promise<IndexedDbRomStore> {
    return new IndexedDbRomStore(await openDatabase(options));
  }

  async save(rom: NewRom): Promise<RomSummary> {
    const summary = summaryOf(rom, crypto.randomUUID());
    const record: RomRecord = { ...summary, bytes: rom.bytes.slice() };
    const tx = this.db.transaction(ROMS, 'readwrite');

    tx.objectStore(ROMS).add(record);
    await completed(tx);

    return summary;
  }

  async list(): Promise<RomSummary[]> {
    const tx = this.db.transaction(ROMS, 'readonly');
    const all = await request<RomRecord[]>(tx.objectStore(ROMS).getAll());

    return all
      .map(({ bytes: _bytes, ...summary }) => summary)
      .sort(newestRomFirst);
  }

  async read(id: string): Promise<Uint8Array | undefined> {
    const tx = this.db.transaction(ROMS, 'readonly');
    const record = await request<RomRecord | undefined>(
      tx.objectStore(ROMS).get(id),
    );

    return record?.bytes;
  }

  async remove(id: string): Promise<void> {
    const tx = this.db.transaction(ROMS, 'readwrite');

    tx.objectStore(ROMS).delete(id);
    await completed(tx);
  }

  close(): void {
    this.db.close();
  }
}
