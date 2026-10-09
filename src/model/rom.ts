// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import { parseRecord } from './record';
import { recordedSourceSchema } from './source';

/**
 * ROM images read from an ECU, kept so they can be downloaded again later.
 * The bytes are stored exactly as the ECU returned them.
 */
export const romSummarySchema = z.object({
  id: z.string(),
  /** What the image was read from; a demo ECU's image is synthetic. */
  source: recordedSourceSchema,
  /** `Date.now()` when the read finished. */
  readAt: z.number(),
  tuneNumber: z.int(),
  tuneIdent: z.int(),
  /** Length of the image in bytes. */
  size: z.int(),
  /** SHA-256 of the image as lower-case hex; `undefined` if the browser cannot compute one. */
  sha256: z.union([z.string(), z.undefined()]),
});

export type RomSummary = z.infer<typeof romSummarySchema>;

/**
 * Whether `value` is a `Uint8Array`. Not `instanceof`: a structured clone,
 * as storage returns, may come from another realm with its own `Uint8Array`.
 */
function isBytes(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === '[object Uint8Array]';
}

/** A saved image as stored: its summary and its bytes. */
export const storedRomSchema = z.extend(romSummarySchema, {
  bytes: z.custom<Uint8Array>(isBytes),
});

export type StoredRom = z.infer<typeof storedRomSchema>;

export type NewRom = Omit<RomSummary, 'id' | 'size'> & { bytes: Uint8Array };

/** A stored image checked against its shape; throws `InvalidRecordError` if it does not fit. */
export function readRom(raw: unknown): StoredRom {
  return parseRecord(storedRomSchema, raw, 'ROM image');
}
