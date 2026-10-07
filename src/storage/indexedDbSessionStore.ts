// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot } from '../ecu/poller';
import type { WriteLogEntry } from '../ecuWrite/writes';
import {
  BY_SESSION,
  CHUNKS,
  completed,
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
  type NewSession,
  type SessionChanges,
  type SessionStore,
  type SessionSummary,
} from './sessionStore';

interface ChunkRecord {
  sessionId: string;
  samples: LiveSnapshot[];
}

type WriteRecord = WriteLogEntry & { sessionId: string };

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
    const tx = this.db.transaction(SESSIONS, 'readonly');
    const all = await request<SessionSummary[]>(
      tx.objectStore(SESSIONS).getAll(),
    );

    return all.sort(newestFirst);
  }

  async get(id: string): Promise<SessionSummary | undefined> {
    const tx = this.db.transaction(SESSIONS, 'readonly');

    return request<SessionSummary | undefined>(
      tx.objectStore(SESSIONS).get(id),
    );
  }

  async readSamples(id: string): Promise<LiveSnapshot[]> {
    const tx = this.db.transaction([SESSIONS, CHUNKS], 'readonly');

    await this.summaryIn(tx.objectStore(SESSIONS), id, tx);

    const chunks = await request<ChunkRecord[]>(
      tx.objectStore(CHUNKS).index(BY_SESSION).getAll(id),
    );

    return chunks.flatMap((chunk) => chunk.samples);
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

    const records = await request<WriteRecord[]>(
      tx.objectStore(WRITES).index(BY_SESSION).getAll(id),
    );

    return records
      .map(({ sessionId: _sessionId, ...write }) => write)
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

  /** Reads a summary inside `tx`, aborting it if the session is unknown. */
  private async summaryIn(
    sessions: IDBObjectStore,
    id: string,
    tx: IDBTransaction,
  ): Promise<SessionSummary> {
    const summary = await request<SessionSummary | undefined>(sessions.get(id));

    if (!summary) {
      if (tx.mode !== 'readonly') {
        tx.abort();
      }

      throw new UnknownSessionError(id);
    }

    return summary;
  }
}
