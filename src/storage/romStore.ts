// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { EcuSource } from '../ecu/connect';

/**
 * ROM images read from an ECU, kept so they can be downloaded again later.
 *
 * `RomStore` is the contract every backend meets: IndexedDB in the browser,
 * memory when storage is unavailable. The bytes are stored exactly as the
 * ECU returned them.
 */

export interface RomSummary {
  id: string;
  /** What the image was read from; a demo ECU's image is synthetic. */
  source: EcuSource['kind'];
  /** `Date.now()` when the read finished. */
  readAt: number;
  tuneNumber: number;
  tuneIdent: number;
  /** Length of the image in bytes. */
  size: number;
  /** SHA-256 of the image as lower-case hex; `undefined` if the browser cannot compute one. */
  sha256: string | undefined;
}

export type NewRom = Omit<RomSummary, 'id' | 'size'> & { bytes: Uint8Array };

export interface RomStore {
  save(rom: NewRom): Promise<RomSummary>;
  /** Every saved image, newest first. */
  list(): Promise<RomSummary[]>;
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
