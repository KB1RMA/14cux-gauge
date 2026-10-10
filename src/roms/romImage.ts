// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  DataSize,
  MemoryOffset,
  ReadCancelledError,
  type Ecu,
} from '@kb1rma/libcomm14cux-ts';
import type { LinkHolder } from '../ecu/session';
import type { RecordedSource } from '../model/source';
import { hex } from '../hex';

/** Length of the ROM image in bytes. */
export const ROM_SIZE: number = DataSize.ROM;

/**
 * How a ROM read holds the link. It takes about half a minute, with nothing
 * else on the link, so polling pauses. A recording would have a gap that
 * replay could draw across, so `RomReader` ends it before taking the link.
 */
export const ROM_READ_HOLDER: LinkHolder = {
  kind: 'romRead',
  pausesPolling: true,
};

/** Bytes read per request: 64 steps, so progress moves smoothly. */
const BLOCK_SIZE = 256;

export interface ReadRomOptions {
  /** Called after each block with the bytes read so far. */
  onProgress(bytesRead: number, total: number): void;
  /** Checked before each block; true stops the read. */
  isCancelled(): boolean;
}

/**
 * Reads the whole ROM image, in blocks so that progress can be shown.
 * The bytes are the same as `ecu.dumpROM()` returns; the library reports no
 * progress for that call.
 *
 * @throws {ReadCancelledError} if `isCancelled` returned true.
 */
export async function readRomImage(
  ecu: Ecu,
  { onProgress, isCancelled }: ReadRomOptions,
): Promise<Uint8Array> {
  const image = new Uint8Array(ROM_SIZE);

  onProgress(0, ROM_SIZE);

  for (let offset = 0; offset < ROM_SIZE; offset += BLOCK_SIZE) {
    if (isCancelled()) {
      throw new ReadCancelledError('The ROM read was cancelled.');
    }

    image.set(
      await ecu.readMem(MemoryOffset.ROMAddress + offset, BLOCK_SIZE),
      offset,
    );
    onProgress(offset + BLOCK_SIZE, ROM_SIZE);
  }

  return image;
}

export interface RomRead {
  tuneNumber: number;
  tuneIdent: number;
  bytes: Uint8Array;
}

/**
 * Reads the tune revision, which names the image, then the image itself.
 *
 * @throws {ReadCancelledError} if `isCancelled` returned true.
 */
export async function readRom(
  ecu: Ecu,
  options: ReadRomOptions,
): Promise<RomRead> {
  const { tuneNumber, tuneIdent } = await ecu.getTuneRevision();
  const bytes = await readRomImage(ecu, options);

  return { tuneNumber, tuneIdent, bytes };
}

/** Stops a ROM read in progress after the block in flight. */
export function cancelRomRead(ecu: Ecu): void {
  ecu.cancelRead();
}

/** Whether `error` is a read stopped by `cancelRomRead` or `isCancelled`. */
export function isRomReadCancelled(error: unknown): boolean {
  return error instanceof ReadCancelledError;
}

/**
 * The file name for an image, such as `14cux-tune-R3652-ident-0x0023.bin`.
 * A demo ECU's synthetic image is named as such.
 */
export function romFileName(
  source: RecordedSource,
  tuneNumber: number,
  tuneIdent: number,
): string {
  const tune = tuneNumber.toString().padStart(4, '0');

  return `14cux-${source === 'demo' ? 'demo-synthetic-' : ''}tune-R${tune}-ident-${hex(tuneIdent, 4)}.bin`;
}

/** SHA-256 of `bytes` as lower-case hex, or `undefined` if the browser cannot compute one. */
export async function sha256Hex(
  bytes: Uint8Array,
): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes.slice());

    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  } catch {
    // `crypto.subtle` exists only in secure contexts.
    return undefined;
  }
}
