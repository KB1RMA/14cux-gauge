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
