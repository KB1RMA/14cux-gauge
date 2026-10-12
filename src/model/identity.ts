// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';

/**
 * What a recording knew of the ECU when it started: the tune, rev limit and
 * fuel map it was running, and the fault codes that were set. Each value is
 * kept as the library returned it, in the library's units, with the time it
 * was read (`Date.now()`, as samples use). A value that could not be read
 * says so, rather than being stored as zero or left out.
 */

/** A read that failed; `message` says why, for the user. */
const failedSchema = z.object({
  status: z.literal('failed'),
  readAt: z.number(),
  message: z.string(),
});

/** A read the ECU answered with a value its firmware cannot produce. */
const invalidSchema = z.object({
  status: z.literal('invalid'),
  readAt: z.number(),
});

function readSchema<T extends z.ZodMiniType>(value: T) {
  return z.object({
    status: z.literal('read'),
    readAt: z.number(),
    value,
  });
}

export const recordedTuneSchema = z.object({
  tuneNumber: z.int(),
  tuneIdent: z.int(),
  checksumFixer: z.int(),
});

export const ecuIdentitySchema = z.object({
  tune: z.discriminatedUnion('status', [
    readSchema(recordedTuneSchema),
    failedSchema,
  ]),
  /** The rev limit in rpm. */
  rpmLimit: z.discriminatedUnion('status', [
    readSchema(z.number()),
    invalidSchema,
    failedSchema,
  ]),
  /** The fuel map in use, 0 to 5. */
  fuelMap: z.discriminatedUnion('status', [
    readSchema(z.int()),
    invalidSchema,
    failedSchema,
  ]),
  /**
   * A flag for each fault code by the library's name; `true` means it was
   * set. Kept by name, not checked against the names this version knows, so
   * a newer library's codes are not lost.
   */
  faultCodes: z.discriminatedUnion('status', [
    readSchema(z.record(z.string(), z.boolean())),
    failedSchema,
  ]),
});

export type EcuIdentity = z.infer<typeof ecuIdentitySchema>;

/** One value of an {@link EcuIdentity}, whatever became of its read. */
export type IdentityRead<T> =
  | { status: 'read'; readAt: number; value: T }
  | { status: 'invalid'; readAt: number }
  | { status: 'failed'; readAt: number; message: string };
