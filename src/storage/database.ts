// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
/**
 * The browser database that holds recorded sessions and saved ROM images,
 * and the small helpers the stores over it share.
 *
 * Four object stores: `sessions` holds one summary per recording, `chunks`
 * holds the samples in batches, one record per `append` (chunk keys
 * auto-increment, so reading a session's chunks through the `sessionId`
 * index returns them in the order they were appended), `writes` holds one
 * record per write to the ECU made while recording, and `roms` holds one
 * record per saved ROM image.
 */

export const DB_NAME = 'cuxGauge';
const DB_VERSION = 4;
export const SESSIONS = 'sessions';
export const CHUNKS = 'chunks';
export const BY_SESSION = 'sessionId';
export const ROMS = 'roms';
export const WRITES = 'writes';

export function request<T>(req: IDBRequest<T>): Promise<T> {
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
 * Every record in `store`, as `[key, record]` pairs. Both are read in the
 * same transaction, so they line up.
 */
export async function entries(
  store: IDBObjectStore,
): Promise<[string, unknown][]> {
  const [keys, records] = await Promise.all([
    request(store.getAllKeys()),
    request<unknown[]>(store.getAll()),
  ]);

  return keys.map((key, index) => [String(key), records[index]]);
}

/**
 * Settles when `tx` commits or fails. A caller that gives up early (such as
 * after aborting for an unknown session) need not await it.
 */
export function completed(tx: IDBTransaction): Promise<void> {
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

/**
 * Takes the object stores from `oldVersion` to the current ones. Only the
 * stores change here; records are migrated as they are read (see
 * `src/model/`), so every backend shares those steps.
 */
function upgrade(db: IDBDatabase, oldVersion: number): void {
  // Each step takes the schema from one version to the next.
  if (oldVersion < 1) {
    db.createObjectStore(SESSIONS, { keyPath: 'id' });
    db.createObjectStore(CHUNKS, { autoIncrement: true }).createIndex(
      BY_SESSION,
      BY_SESSION,
    );
  }

  // Version 2 changed no stores: session format 2 added notes, and
  // `readSession` adds them to format 1 sessions as they are read.

  if (oldVersion < 3) {
    // ROM images.
    db.createObjectStore(ROMS, { keyPath: 'id' });
  }

  if (oldVersion < 4) {
    // Session format 3 keeps writes to the ECU. Sessions already recorded
    // stay in format 2: whether writes were made during them is not known.
    db.createObjectStore(WRITES, { keyPath: 'id' }).createIndex(
      BY_SESSION,
      BY_SESSION,
    );
  }
}

export interface DatabaseOptions {
  /** The IndexedDB factory; defaults to the browser's `indexedDB`. */
  factory?: IDBFactory;
  /** Database name; tests use their own. */
  name?: string;
}

/** Opens the database, creating or upgrading it if needed. */
export async function openDatabase({
  factory = indexedDB,
  name = DB_NAME,
}: DatabaseOptions = {}): Promise<IDBDatabase> {
  const req = factory.open(name, DB_VERSION);

  req.onupgradeneeded = (event) => {
    upgrade(req.result, event.oldVersion);
  };

  const db = await request(req);

  // Another tab upgrading the schema must not be blocked by this one.
  db.onversionchange = () => {
    db.close();
  };

  return db;
}
