// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import {
  InvalidRecordError,
  parseRecord,
  sortRecords,
  type UnreadableRecord,
} from '../model/record';
import {
  readSession,
  type NewSession,
  type SessionChanges,
  type SessionSummary,
} from '../model/session';
import { isSnapshotLike, type LiveSnapshot } from '../model/snapshot';
import { writeLogEntrySchema, type WriteLogEntry } from '../model/write';
import {
  BY_SESSION,
  CHUNKS,
  completed,
  entries,
  openDatabase,
  request,
  SESSIONS,
  WRITES,
  type DatabaseOptions,
} from './database';
import {
  applyChanges,
  byStart,
  copyWrite,
  emptySummary,
  newestFirst,
  UnknownSessionError,
  type SessionStore,
} from './sessionStore';

interface ChunkRecord {
  sessionId: string;
  samples: LiveSnapshot[];
}

const writeRecordSchema = z.extend(writeLogEntrySchema, {
  sessionId: z.string(),
});

type WriteRecord = z.infer<typeof writeRecordSchema>;

/**
 * The samples of a stored chunk. Each is only checked to be a snapshot with a
 * time, not parsed reading by reading: a long session holds hundreds of
 * thousands of samples.
 */
function samplesOf(raw: unknown): LiveSnapshot[] {
  const samples = (raw as { samples?: unknown } | null)?.samples;

  if (!Array.isArray(samples) || !samples.every(isSnapshotLike)) {
    throw new InvalidRecordError('samples', 'not a list of snapshots');
  }

  return samples;
}

export type OpenOptions = DatabaseOptions;

/**
 * Sessions in IndexedDB, which (unlike `localStorage`) holds hours of
 * samples without blocking the page.
 */
export class IndexedDbSessionStore implements SessionStore {
  private constructor(private readonly db: IDBDatabase) {}

  /** Opens (creating or upgrading if needed) the sessions database. */
  static async open(options: OpenOptions = {}): Promise<IndexedDbSessionStore> {
    return new IndexedDbSessionStore(await openDatabase(options));
  }

  async create(session: NewSession): Promise<SessionSummary> {
    const summary = emptySummary(session);
    const tx = this.db.transaction(SESSIONS, 'readwrite');

    tx.objectStore(SESSIONS).add(summary);
    await completed(tx);

    return summary;
  }

  async append(id: string, samples: readonly LiveSnapshot[]): Promise<void> {
    if (samples.length === 0) {
      return;
    }

    // One transaction, so the chunk and the sample count stay in step.
    const tx = this.db.transaction([SESSIONS, CHUNKS], 'readwrite');
    const done = completed(tx);
    const sessions = tx.objectStore(SESSIONS);
    const summary = await this.summaryIn(sessions, id, tx);
    const chunk: ChunkRecord = { sessionId: id, samples: [...samples] };

    tx.objectStore(CHUNKS).add(chunk);
    sessions.put({
      ...summary,
      sampleCount: summary.sampleCount + samples.length,
    });
    await done;
  }

  async finish(id: string, endedAt: number): Promise<SessionSummary> {
    const tx = this.db.transaction(SESSIONS, 'readwrite');
    const done = completed(tx);
    const sessions = tx.objectStore(SESSIONS);
    const finished = { ...(await this.summaryIn(sessions, id, tx)), endedAt };

    sessions.put(finished);
    await done;

    return finished;
  }

  async update(id: string, changes: SessionChanges): Promise<SessionSummary> {
    const tx = this.db.transaction(SESSIONS, 'readwrite');
    const done = completed(tx);
    const sessions = tx.objectStore(SESSIONS);
    const updated = applyChanges(
      await this.summaryIn(sessions, id, tx),
      changes,
    );

    sessions.put(updated);
    await done;

    return updated;
  }

  async list(): Promise<SessionSummary[]> {
    return (await this.readAll()).readable.sort(newestFirst);
  }

  async listUnreadable(): Promise<UnreadableRecord[]> {
    return (await this.readAll()).unreadable;
  }

  async get(id: string): Promise<SessionSummary | undefined> {
    const tx = this.db.transaction(SESSIONS, 'readonly');
    const raw = await request<unknown>(tx.objectStore(SESSIONS).get(id));

    return raw === undefined ? undefined : readSession(raw);
  }

  async readSamples(id: string): Promise<LiveSnapshot[]> {
    const tx = this.db.transaction([SESSIONS, CHUNKS], 'readonly');

    await this.summaryIn(tx.objectStore(SESSIONS), id, tx);

    const chunks = await request<unknown[]>(
      tx.objectStore(CHUNKS).index(BY_SESSION).getAll(id),
    );

    return chunks.flatMap(samplesOf);
  }

  async putWrite(id: string, write: WriteLogEntry): Promise<void> {
    const tx = this.db.transaction([SESSIONS, WRITES], 'readwrite');
    const done = completed(tx);

    await this.summaryIn(tx.objectStore(SESSIONS), id, tx);

    const record: WriteRecord = { ...copyWrite(write), sessionId: id };

    tx.objectStore(WRITES).put(record);
    await done;
  }

  async readWrites(id: string): Promise<WriteLogEntry[]> {
    const tx = this.db.transaction([SESSIONS, WRITES], 'readonly');

    await this.summaryIn(tx.objectStore(SESSIONS), id, tx);

    const records = await request<unknown[]>(
      tx.objectStore(WRITES).index(BY_SESSION).getAll(id),
    );

    return records
      .map((raw) => {
        const { sessionId: _sessionId, ...write } = parseRecord(
          writeRecordSchema,
          raw,
          'write to the ECU',
        );

        return write;
      })
      .sort(byStart);
  }

  async remove(id: string): Promise<void> {
    const tx = this.db.transaction([SESSIONS, CHUNKS, WRITES], 'readwrite');
    const done = completed(tx);

    for (const name of [CHUNKS, WRITES]) {
      const records = tx.objectStore(name);
      const keys = await request(records.index(BY_SESSION).getAllKeys(id));

      for (const key of keys) {
        records.delete(key);
      }
    }

    tx.objectStore(SESSIONS).delete(id);
    await done;
  }

  close(): void {
    this.db.close();
  }

  private async readAll() {
    const tx = this.db.transaction(SESSIONS, 'readonly');

    return sortRecords(await entries(tx.objectStore(SESSIONS)), readSession);
  }

  /**
   * Reads a summary inside `tx`, migrated to the current format, aborting
   * `tx` if the session is unknown or cannot be read.
   */
  private async summaryIn(
    sessions: IDBObjectStore,
    id: string,
    tx: IDBTransaction,
  ): Promise<SessionSummary> {
    const raw = await request<unknown>(sessions.get(id));

    try {
      if (raw === undefined) {
        throw new UnknownSessionError(id);
      }

      return readSession(raw);
    } catch (error) {
      if (tx.mode !== 'readonly') {
        tx.abort();
      }

      throw error;
    }
  }
}
