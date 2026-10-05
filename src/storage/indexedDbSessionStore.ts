// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot } from '../ecu/poller';
import {
  applyChanges,
  emptySummary,
  newestFirst,
  UnknownSessionError,
  type NewSession,
  type SessionChanges,
  type SessionStore,
  type SessionSummary,
} from './sessionStore';

/**
 * Sessions in IndexedDB, which (unlike `localStorage`) holds hours of
 * samples without blocking the page.
 *
 * Two object stores: `sessions` holds one summary per recording, and
 * `chunks` holds the samples in batches, one record per `append`. Chunk keys
 * auto-increment, so reading a session's chunks through the `sessionId`
 * index returns them in the order they were appended.
 */

const DB_NAME = 'cuxGauge';
const DB_VERSION = 2;
const SESSIONS = 'sessions';
const CHUNKS = 'chunks';
const BY_SESSION = 'sessionId';

interface ChunkRecord {
  sessionId: string;
  samples: LiveSnapshot[];
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };

    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'));
    };
  });
}

/**
 * Settles when `tx` commits or fails. A caller that gives up early (such as
 * after aborting for an unknown session) need not await it.
 */
function completed(tx: IDBTransaction): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };

    // The failing request carries the cause; `tx.error` is only set once
    // the transaction has aborted.
    tx.onerror = (event) => {
      const request = event.target as IDBRequest | null;

      reject(
        request?.error ?? tx.error ?? new Error('IndexedDB transaction failed'),
      );
    };

    tx.onabort = () => {
      reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    };
  });

  void done.catch(() => undefined);

  return done;
}

function upgrade(
  db: IDBDatabase,
  tx: IDBTransaction,
  oldVersion: number,
): void {
  // Each step takes the schema from one version to the next.
  if (oldVersion < 1) {
    db.createObjectStore(SESSIONS, { keyPath: 'id' });
    db.createObjectStore(CHUNKS, { autoIncrement: true }).createIndex(
      BY_SESSION,
      BY_SESSION,
    );
  }

  if (oldVersion < 2) {
    // Session format 2 adds notes.
    const cursor = tx.objectStore(SESSIONS).openCursor();

    cursor.onsuccess = () => {
      const current = cursor.result;

      if (current) {
        current.update({
          ...(current.value as Omit<SessionSummary, 'notes' | 'formatVersion'>),
          notes: '',
          formatVersion: 2,
        });
        current.continue();
      }
    };
  }
}

export interface OpenOptions {
  /** The IndexedDB factory; defaults to the browser's `indexedDB`. */
  factory?: IDBFactory;
  /** Database name; tests use their own. */
  name?: string;
}

export class IndexedDbSessionStore implements SessionStore {
  private constructor(private readonly db: IDBDatabase) {}

  /** Opens (creating or upgrading if needed) the sessions database. */
  static async open({
    factory = indexedDB,
    name = DB_NAME,
  }: OpenOptions = {}): Promise<IndexedDbSessionStore> {
    const req = factory.open(name, DB_VERSION);

    req.onupgradeneeded = (event) => {
      // Set while an upgrade is running; the steps share its transaction.
      if (req.transaction) {
        upgrade(req.result, req.transaction, event.oldVersion);
      }
    };

    const db = await request(req);

    // Another tab upgrading the schema must not be blocked by this one.
    db.onversionchange = () => {
      db.close();
    };

    return new IndexedDbSessionStore(db);
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

  async remove(id: string): Promise<void> {
    const tx = this.db.transaction([SESSIONS, CHUNKS], 'readwrite');
    const done = completed(tx);
    const chunks = tx.objectStore(CHUNKS);
    const keys = await request(chunks.index(BY_SESSION).getAllKeys(id));

    for (const key of keys) {
      chunks.delete(key);
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
