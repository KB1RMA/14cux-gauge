// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import { ecuIdentitySchema } from './identity';
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
 * made during them is not known. 4: keeps the ECU's identity and fault codes
 * from the start of the recording; older sessions read with `identity: null`,
 * as it was not recorded.
 */
export const SESSION_FORMAT_VERSION = 4;

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

const notesField = {
  /** Free text the user keeps with the session; empty if none. */
  notes: z.string(),
};

export const sessionSummarySchema = z.object({
  ...summaryFields,
  ...notesField,
  /**
   * The ECU's identity and fault codes when recording started; `null` in a
   * session from before they were recorded (format 3 and older).
   */
  identity: z.nullable(ecuIdentitySchema),
  formatVersion: z.literal([2, 3, SESSION_FORMAT_VERSION]),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export type SessionFormatVersion = SessionSummary['formatVersion'];

/** A summary in formats 2 and 3: no identity. */
const format2Schema = z.object({
  ...summaryFields,
  ...notesField,
  formatVersion: z.literal([2, 3]),
});

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
      identity: null,
      formatVersion: 2,
    };
  }

  if (formatVersion === 2 || formatVersion === 3) {
    return { ...parseRecord(format2Schema, raw, 'session'), identity: null };
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

/**
 * `session` as its format stores it: a session from before identities were
 * recorded is written back without one, so changing it (a rename, notes)
 * never adds a field its format does not have.
 */
export function storedSession(
  session: SessionSummary,
): Omit<SessionSummary, 'identity'> &
  Partial<Pick<SessionSummary, 'identity'>> {
  if (session.formatVersion >= 4) {
    return session;
  }

  const { identity: _identity, ...older } = session;

  return older;
}

/** Whether `session` kept its writes to the ECU (format 3 on). */
export function keepsWrites(session: SessionSummary): boolean {
  return session.formatVersion >= 3;
}

export type NewSession = Pick<
  SessionSummary,
  'name' | 'source' | 'startedAt' | 'identity'
>;

/** The parts of a session the user can edit. */
export type SessionChanges = Partial<Pick<SessionSummary, 'name' | 'notes'>>;
