// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import { ecuIdentitySchema } from './identity';
import { fieldsOf, InvalidRecordError, parseRecord } from './record';
import type { LiveSnapshot } from './snapshot';
import { recordedSourceSchema } from './source';
import type { RecordedWrite } from './write';

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
 * as it was not recorded. 5: says whether the writes were kept, rather than
 * leaving it to the format, and where a session opened from a file came from;
 * older sessions read with `imported: null`.
 */
export const SESSION_FORMAT_VERSION = 5;

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

const identityField = {
  /**
   * The ECU's identity and fault codes when recording started; `null` in a
   * session from before they were recorded (format 3 and older, or a file
   * saved from one).
   */
  identity: z.nullable(ecuIdentitySchema),
};

/**
 * Where a session opened from a file came from. The file's own claims
 * (`savedAt`, `savedBy`) are kept as the file states them.
 */
export const importNoteSchema = z.object({
  /** The name of the file it was opened from. */
  fileName: z.string(),
  /** `Date.now()` when it was opened. */
  importedAt: z.number(),
  /** `Date.now()` when the file was saved, as the file says. */
  savedAt: z.number(),
  /** What saved the file, as the file says, such as "14CUX Gauge 0.13.0". */
  savedBy: z.string(),
});

export type ImportNote = z.infer<typeof importNoteSchema>;

const format5Fields = {
  /**
   * Whether writes to the ECU made while recording were kept. False for a
   * session from before they were (format 2), or a file saved from one.
   */
  writesKept: z.boolean(),
  /** Where the session came from if it was opened from a file; else `null`. */
  imported: z.nullable(importNoteSchema),
};

export const sessionSummarySchema = z.object({
  ...summaryFields,
  ...notesField,
  ...identityField,
  ...format5Fields,
  formatVersion: z.literal([2, 3, 4, SESSION_FORMAT_VERSION]),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export type SessionFormatVersion = SessionSummary['formatVersion'];

/** A summary in format 4: whether writes were kept follows from the format. */
const format4Schema = z.object({
  ...summaryFields,
  ...notesField,
  ...identityField,
  formatVersion: z.literal(4),
});

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
      writesKept: false,
      imported: null,
      formatVersion: 2,
    };
  }

  if (formatVersion === 2 || formatVersion === 3) {
    const older = parseRecord(format2Schema, raw, 'session');

    return {
      ...older,
      identity: null,
      writesKept: older.formatVersion === 3,
      imported: null,
    };
  }

  if (formatVersion === 4) {
    return {
      ...parseRecord(format4Schema, raw, 'session'),
      writesKept: true,
      imported: null,
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

type Format5Field = keyof typeof format5Fields;

/**
 * `session` as its format stores it: an older session is written back
 * without the fields its format does not have (the identity before format 4;
 * `writesKept` and `imported` before format 5), so changing it (a rename,
 * notes) never changes its format.
 */
export function storedSession(
  session: SessionSummary,
): Omit<SessionSummary, 'identity' | Format5Field> &
  Partial<Pick<SessionSummary, 'identity' | Format5Field>> {
  if (session.formatVersion >= 5) {
    return session;
  }

  const { writesKept: _writesKept, imported: _imported, ...format4 } = session;

  if (session.formatVersion >= 4) {
    return format4;
  }

  const { identity: _identity, ...older } = format4;

  return older;
}

/** Whether `session` kept its writes to the ECU. */
export function keepsWrites(session: SessionSummary): boolean {
  return session.writesKept;
}

export type NewSession = Pick<
  SessionSummary,
  'name' | 'source' | 'startedAt' | 'identity'
>;

/**
 * A whole session to store at once, as opened from a file: its summary,
 * every sample, and its writes to the ECU.
 */
export interface ImportedSession {
  session: Pick<
    SessionSummary,
    | 'name'
    | 'notes'
    | 'source'
    | 'startedAt'
    | 'endedAt'
    | 'identity'
    | 'writesKept'
  > & { imported: ImportNote };
  samples: LiveSnapshot[];
  writes: RecordedWrite[];
}

/** The parts of a session the user can edit. */
export type SessionChanges = Partial<Pick<SessionSummary, 'name' | 'notes'>>;
