// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  fileRecording,
  readRecordingFile,
  RECORDING_FILE_EXTENSION,
  recordingFileText,
} from '../model/recordingFile';
import type { SessionSummary } from '../model/session';
import {
  UnknownSessionError,
  type SessionStore,
} from '../storage/sessionStore';
import { sessionFileName } from './format';

/** A recording file ready to save. */
export interface RecordingFileContents {
  /** A file name for it, from the session's name or, for several, the date. */
  name: string;
  text: string;
}

/**
 * The sessions `ids`, in that order, as one recording file: everything
 * stored for each, samples at full precision in the library's units.
 * A session still being recorded gives what has been saved so far.
 */
export async function saveRecordings(
  store: SessionStore,
  ids: readonly string[],
  { savedAt, savedBy }: { savedAt: number; savedBy: string },
): Promise<RecordingFileContents> {
  const sessions = await Promise.all(
    ids.map(async (id) => {
      const [session, samples, writes] = await Promise.all([
        store.get(id),
        store.readSamples(id),
        store.readWrites(id),
      ]);

      if (!session) {
        throw new UnknownSessionError(id);
      }

      return { session, recording: fileRecording(session, samples, writes) };
    }),
  );
  const [only] = sessions;
  const name =
    sessions.length === 1 && only
      ? sessionFileName(
          only.session.name,
          only.session.startedAt,
          RECORDING_FILE_EXTENSION,
        )
      : sessionFileName('14CUX recordings', savedAt, RECORDING_FILE_EXTENSION);

  return {
    name,
    text: recordingFileText({
      savedAt,
      savedBy,
      recordings: sessions.map(({ recording }) => recording),
    }),
  };
}

/**
 * Stores every recording in a file, all or none, each noting the file it
 * came from. Rejects with a `RecordingFileError` saying why if the file
 * cannot be opened.
 */
export async function openRecordings(
  store: SessionStore,
  file: { name: string; text: string },
  importedAt: number,
): Promise<SessionSummary[]> {
  return store.importSessions(
    readRecordingFile(file.text, file.name, importedAt),
  );
}
