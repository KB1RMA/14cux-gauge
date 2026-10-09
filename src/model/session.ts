// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import { fieldsOf, InvalidRecordError, parseRecord } from './record';
import { recordedSourceSchema } from './source';

/**
 * Recorded debug sessions: the live snapshots from one connection, kept so
 * they can be reviewed or exported later, and the writes to the ECU made
 * while recording. Snapshots are kept as the poller produced them, in the
 * library's units, so a recording does not depend on the display units
 * chosen at the time.
 */

/**
 * Bumped when the stored shape changes; {@link readSession} migrates older
 * ones.
 *
 * 1: the first format. 2: adds `notes`. 3: keeps the writes to the ECU made
 * while recording. Sessions in format 2 stay in it: whether any writes were
 * made during them is not known.
 */
export const SESSION_FORMAT_VERSION = 3;

const summaryFields = {
  id: z.string(),
  name: z.string(),
  source: recordedSourceSchema,
  /** `Date.now()` when recording started. */
  startedAt: z.number(),
  /** `Date.now()` when recording stopped; `null` while recording, or if the app closed first. */
  endedAt: z.nullable(z.number()),
  sampleCount: z.int(),
};

export const sessionSummarySchema = z.object({
  ...summaryFields,
  /** Free text the user keeps with the session; empty if none. */
  notes: z.string(),
  formatVersion: z.literal([2, SESSION_FORMAT_VERSION]),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export type SessionFormatVersion = SessionSummary['formatVersion'];

/** A summary as the first release of the app stored it: no notes. */
const format1Schema = z.object({
  ...summaryFields,
  formatVersion: z.literal(1),
});

/**
 * A stored summary in the current shape, migrated from an older format if
 * needed. Every session store runs what it reads through this. Throws an
 * `InvalidRecordError` for a summary it cannot read, including one written
 * by a newer version of the app.
 */
export function readSession(raw: unknown): SessionSummary {
  const { formatVersion } = fieldsOf(raw);

  if (formatVersion === 1) {
    return {
      ...parseRecord(format1Schema, raw, 'session'),
      notes: '',
      formatVersion: 2,
    };
  }

  if (
    typeof formatVersion === 'number' &&
    formatVersion > SESSION_FORMAT_VERSION
  ) {
    throw new InvalidRecordError(
      'session',
      `format ${String(formatVersion)} is from a newer version of the app`,
    );
  }

  return parseRecord(sessionSummarySchema, raw, 'session');
}

/** Whether `session` kept its writes to the ECU (format 3 on). */
export function keepsWrites(session: SessionSummary): boolean {
  return session.formatVersion >= 3;
}

export type NewSession = Pick<SessionSummary, 'name' | 'source' | 'startedAt'>;

/** The parts of a session the user can edit. */
export type SessionChanges = Partial<Pick<SessionSummary, 'name' | 'notes'>>;
