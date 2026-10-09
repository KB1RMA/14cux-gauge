// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { UnreadableRecord } from '../model/record';
import type { NewRom, RomSummary } from '../model/rom';

/**
 * Where saved ROM images (see `src/model/rom.ts`) are kept.
 *
 * `RomStore` is the contract every backend meets: IndexedDB in the browser,
 * memory when storage is unavailable.
 */

export interface RomStore {
  save(rom: NewRom): Promise<RomSummary>;
  /** Every saved image that can be read, newest first. */
  list(): Promise<RomSummary[]>;
  /** Saved images that cannot be read, so the user can see and delete them. */
  listUnreadable(): Promise<UnreadableRecord[]>;
  /** The bytes of an image, or `undefined` if it is not saved. */
  read(id: string): Promise<Uint8Array | undefined>;
  /** Deletes an image. Unknown ids are ignored. */
  remove(id: string): Promise<void>;
  close(): void;
}

export function summaryOf(rom: NewRom, id: string): RomSummary {
  const { bytes, ...rest } = rom;

  return { ...rest, id, size: bytes.length };
}

export function newestRomFirst(a: RomSummary, b: RomSummary): number {
  return b.readAt - a.readAt;
}

/** Keeps images in memory only: the fallback when no storage is available. */
export class MemoryRomStore implements RomStore {
  private readonly roms = new Map<
    string,
    { summary: RomSummary; bytes: Uint8Array }
  >();

  async save(rom: NewRom): Promise<RomSummary> {
    const summary = summaryOf(rom, crypto.randomUUID());

    this.roms.set(summary.id, { summary, bytes: rom.bytes.slice() });

    return { ...summary };
  }

  async list(): Promise<RomSummary[]> {
    return [...this.roms.values()]
      .map(({ summary }) => ({ ...summary }))
      .sort(newestRomFirst);
  }

  async listUnreadable(): Promise<UnreadableRecord[]> {
    // Only this visit's images, which are always readable.
    return [];
  }

  async read(id: string): Promise<Uint8Array | undefined> {
    return this.roms.get(id)?.bytes.slice();
  }

  async remove(id: string): Promise<void> {
    this.roms.delete(id);
  }

  close(): void {
    // Nothing to release.
  }
}
