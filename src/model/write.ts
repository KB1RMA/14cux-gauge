// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';

/** Every feature that writes to the ECU. Only one may run at a time. */
export const writeIdSchema = z.enum([
  'clearFaultCodes',
  'idleAirControl',
  'fuelPump',
]);

export type WriteId = z.infer<typeof writeIdSchema>;

/**
 * How a write went: `running` until it ends; `done`; `failed` when nothing
 * was written; `partial` when it failed after it may have written something.
 */
export const writeOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('running') }),
  z.object({
    status: z.enum(['done', 'failed', 'partial']),
    message: z.string(),
  }),
]);

export type WriteOutcome = z.infer<typeof writeOutcomeSchema>;

export type FinishedOutcome = Exclude<WriteOutcome, { status: 'running' }>;

/**
 * One write from start to end, as a recording keeps it. Times are
 * `Date.now()`, the clock sample timestamps use, so the write lines up with
 * the readings it changed.
 */
export const writeLogEntrySchema = z.object({
  /** Unique to this write. */
  id: z.string(),
  write: writeIdSchema,
  startedAt: z.number(),
  /** `null` while it runs, and in a recording that stopped first. */
  endedAt: z.nullable(z.number()),
  outcome: writeOutcomeSchema,
});

export type WriteLogEntry = z.infer<typeof writeLogEntrySchema>;

/** The statuses this version of the app records. */
const KNOWN_STATUSES: readonly string[] = [
  'running',
  'done',
  'failed',
  'partial',
];

/**
 * A write as read back from a recording. A newer version of the app may have
 * recorded a kind of write or a result that this one does not know, without
 * changing the session format; such a write is kept as recorded rather than
 * making the whole session unreadable. A known result must still have its
 * known shape.
 */
export const recordedWriteSchema = z.object({
  id: z.string(),
  write: z.string(),
  startedAt: z.number(),
  endedAt: z.nullable(z.number()),
  outcome: z.union([
    writeOutcomeSchema,
    z.object({
      status: z
        .string()
        .check(z.refine((status) => !KNOWN_STATUSES.includes(status))),
      message: z.optional(z.string()),
    }),
  ]),
});

export type RecordedWrite = z.infer<typeof recordedWriteSchema>;
