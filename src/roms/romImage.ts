// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  DataSize,
  MemoryOffset,
  ReadCancelledError,
  type Ecu,
} from '@kb1rma/libcomm14cux-ts';
import type { RecordedSource } from '../model/source';
import { hex } from '../hex';

/** Length of the ROM image in bytes. */
export const ROM_SIZE: number = DataSize.ROM;

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

/** Saves `bytes` as a file through the browser's download. */
export function downloadBytes(fileName: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(
    new Blob([bytes.slice()], { type: 'application/octet-stream' }),
  );
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
}
