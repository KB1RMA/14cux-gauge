// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  readRom,
  type NewRom,
  type RomSummary,
  type StoredRom,
} from '../model/rom';
import { sortRecords, type UnreadableRecord } from '../model/record';
import { completed, entries, request, ROMS } from './database';
import { Listeners, type OpenChangeChannel } from './listeners';
import { newestRomFirst, summaryOf, type RomStore } from './romStore';

/**
 * ROM images in IndexedDB, one record each, bytes included. It uses a
 * connection opened by `openStorage`, which closes it.
 */
export class IndexedDbRomStore implements RomStore {
  private readonly listeners: Listeners;
  readonly subscribe: RomStore['subscribe'];

  /**
   * `openChannel` lets stores over the same database, in other windows,
   * hear of each other's saves and removes.
   */
  constructor(
    private readonly db: IDBDatabase,
    openChannel?: OpenChangeChannel,
  ) {
    this.listeners = new Listeners(openChannel?.(`${db.name}:roms`));
    this.subscribe = this.listeners.subscribe;
  }

  /** Stops listening to other windows. The connection is closed by its owner. */
  close(): void {
    this.listeners.close();
  }

  async save(rom: NewRom): Promise<RomSummary> {
    const summary = summaryOf(rom, crypto.randomUUID());
    const record: StoredRom = { ...summary, bytes: rom.bytes.slice() };
    const tx = this.db.transaction(ROMS, 'readwrite');

    tx.objectStore(ROMS).add(record);
    await completed(tx);
    this.listeners.notify();

    return summary;
  }

  async list(): Promise<RomSummary[]> {
    return (await this.readAll()).readable
      .map(({ bytes: _bytes, ...summary }) => summary)
      .sort(newestRomFirst);
  }

  async listUnreadable(): Promise<UnreadableRecord[]> {
    return (await this.readAll()).unreadable;
  }

  async read(id: string): Promise<Uint8Array | undefined> {
    const tx = this.db.transaction(ROMS, 'readonly');
    const raw = await request<unknown>(tx.objectStore(ROMS).get(id));

    return raw === undefined ? undefined : readRom(raw).bytes;
  }

  async remove(id: string): Promise<void> {
    const tx = this.db.transaction(ROMS, 'readwrite');

    tx.objectStore(ROMS).delete(id);
    await completed(tx);
    this.listeners.notify();
  }

  private async readAll() {
    const tx = this.db.transaction(ROMS, 'readonly');

    return sortRecords(await entries(tx.objectStore(ROMS)), readRom);
  }
}
