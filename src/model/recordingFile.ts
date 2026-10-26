// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import { ecuIdentitySchema } from './identity';
import { describeIssues, fieldsOf } from './record';
import type { ImportNote, ImportedSession } from './session';
import { liveSnapshotSchema, type LiveSnapshot } from './snapshot';
import { recordedSourceSchema } from './source';
import { recordedWriteSchema, type RecordedWrite } from './write';

/**
 * Recording files: one or more recorded sessions saved as a JSON file, to
 * keep as a backup, move to another computer or send to someone helping.
 * Unlike CSV, a file holds everything the app keeps (every sample in the
 * library's units at full precision, notes, the ECU's identity and the
 * writes to the ECU), so opening it gives back the same recording.
 *
 * The format is a public contract, described in `docs/recording-file.md`.
 * Change it only by bumping {@link RECORDING_FILE_VERSION} and reading the
 * older versions too.
 */

/** What every recording file says it is, so other JSON is not mistaken for one. */
export const RECORDING_FILE_KIND = '14cux-gauge-recordings';

/** 1: the first format. */
export const RECORDING_FILE_VERSION = 1;

/** The file name extension and type recording files are saved with. */
export const RECORDING_FILE_EXTENSION = '.json';
export const RECORDING_FILE_TYPE = 'application/json';

/**
 * One sample. Strict, so a reading this version does not know (from a newer
 * version of the app that forgot to change the format) is reported rather
 * than dropped.
 */
const sampleSchema = z.strictObject(liveSnapshotSchema.shape);

const recordingSchema = z.strictObject({
  name: z.string(),
  notes: z.string(),
  source: recordedSourceSchema,
  /** `Date.now()` when recording started. */
  startedAt: z.number(),
  /** `Date.now()` when recording stopped; `null` if it never did. */
  endedAt: z.nullable(z.number()),
  /** The ECU's identity and fault codes at the start; `null` if not recorded. */
  identity: z.nullable(ecuIdentitySchema),
  /**
   * Writes to the ECU made while recording, in the order they started;
   * `null` if the recording is from before they were kept.
   */
  writes: z.nullable(z.array(recordedWriteSchema)),
  /** Every sample, in the order recorded. */
  samples: z.array(sampleSchema),
});

const fileSchema = z.strictObject({
  kind: z.literal(RECORDING_FILE_KIND),
  version: z.literal(RECORDING_FILE_VERSION),
  /** `Date.now()` when the file was saved. */
  savedAt: z.number(),
  /** The app and version that saved it, such as "14CUX Gauge 0.13.0". */
  savedBy: z.string(),
  recordings: z.array(recordingSchema),
});

export type RecordingFile = z.infer<typeof fileSchema>;

export type FileRecording = z.infer<typeof recordingSchema>;

/** A file the user chose that cannot be opened as recordings. */
export class RecordingFileError extends Error {
  constructor(
    readonly fileName: string,
    /** Why, as the end of a sentence that names the file. */
    readonly reason: string,
  ) {
    super(`${fileName} could not be opened: ${reason}.`);
    this.name = 'RecordingFileError';
  }
}

/** A session as a recording file holds it. */
export function fileRecording(
  session: Pick<
    ImportedSession['session'],
    | 'name'
    | 'notes'
    | 'source'
    | 'startedAt'
    | 'endedAt'
    | 'identity'
    | 'writesKept'
  >,
  samples: readonly LiveSnapshot[],
  writes: readonly RecordedWrite[],
): FileRecording {
  return {
    name: session.name,
    notes: session.notes,
    source: session.source,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    identity: session.identity,
    writes: session.writesKept ? [...writes] : null,
    samples: [...samples],
  };
}

/**
 * A recording file's text. Numbers are written as JavaScript writes them,
 * which reads back to the same value, so samples keep their full precision.
 * (JSON has no negative zero; a reading of -0 reads back as 0.)
 */
export function recordingFileText(
  file: Omit<RecordingFile, 'kind' | 'version'>,
): string {
  const whole: RecordingFile = {
    kind: RECORDING_FILE_KIND,
    version: RECORDING_FILE_VERSION,
    ...file,
  };

  return `${JSON.stringify(whole)}\n`;
}

/**
 * The sessions in a recording file named `fileName`, ready to store, each
 * noting where it came from. Throws a {@link RecordingFileError} saying why
 * if the file is not one, is from a newer version of the app, or has any
 * value wrong: a file is opened whole or not at all.
 */
export function readRecordingFile(
  text: string,
  fileName: string,
  importedAt: number,
): ImportedSession[] {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    throw new RecordingFileError(fileName, 'it is not a recording file');
  }

  const { kind, version } = fieldsOf(raw);

  if (kind !== RECORDING_FILE_KIND) {
    throw new RecordingFileError(fileName, 'it is not a recording file');
  }

  if (typeof version === 'number' && version > RECORDING_FILE_VERSION) {
    throw new RecordingFileError(
      fileName,
      `it was saved by a newer version of the app (file format ${String(version)}). Update the app to open it`,
    );
  }

  const result = fileSchema.safeParse(raw);

  if (!result.success) {
    throw new RecordingFileError(
      fileName,
      `it is damaged (${describeIssues(result.error)})`,
    );
  }

  const { savedAt, savedBy, recordings } = result.data;
  const imported: ImportNote = { fileName, importedAt, savedAt, savedBy };

  return recordings.map(({ writes, samples, ...session }) => ({
    session: { ...session, writesKept: writes !== null, imported },
    samples,
    writes: writes ?? [],
  }));
}
