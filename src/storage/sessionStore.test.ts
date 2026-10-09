// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IDBFactory } from 'fake-indexeddb';
import type { WriteLogEntry } from '../model/write';
import { InvalidRecordError } from '../model/record';
import { snapshotAt } from '../test-support/snapshots';
import { plantRecords } from '../test-support/storedRecords';
import { openDatabase } from './database';
import { IndexedDbSessionStore } from './indexedDbSessionStore';
import { openSessionStore } from './openSessionStore';
import {
  MemorySessionStore,
  UnknownSessionError,
  type SessionStore,
} from './sessionStore';

const backends: [string, () => Promise<SessionStore>][] = [
  ['MemorySessionStore', () => Promise.resolve(new MemorySessionStore())],
  [
    'IndexedDbSessionStore',
    () => IndexedDbSessionStore.open({ factory: new IDBFactory() }),
  ],
];

const PUMP_RUNNING: WriteLogEntry = {
  id: 'pump-1',
  write: 'fuelPump',
  startedAt: 2000,
  endedAt: null,
  outcome: { status: 'running' },
};
const PUMP_STOPPED: WriteLogEntry = {
  ...PUMP_RUNNING,
  endedAt: 4100,
  outcome: { status: 'done', message: 'Fuel pump stopped.' },
};
const CLEARED: WriteLogEntry = {
  id: 'clear-1',
  write: 'clearFaultCodes',
  startedAt: 1500,
  endedAt: 1600,
  outcome: {
    status: 'partial',
    message: 'Clearing may be incomplete. The ECU stopped responding.',
  },
};

describe.each(backends)('%s', (_name, open) => {
  let store: SessionStore;

  beforeEach(async () => {
    store = await open();
  });

  afterEach(() => {
    store.close();
  });

  it('creates an empty, unfinished session', async () => {
    const session = await store.create({
      name: 'Idle check',
      source: 'demo',
      startedAt: 1000,
    });

    expect(session).toEqual({
      id: expect.any(String) as string,
      name: 'Idle check',
      source: 'demo',
      startedAt: 1000,
      endedAt: null,
      sampleCount: 0,
      notes: '',
      formatVersion: 3,
    });
    expect(await store.get(session.id)).toEqual(session);
    expect(await store.readSamples(session.id)).toEqual([]);
    expect(await store.listUnreadable()).toEqual([]);
  });

  it('keeps appended samples in order and counts them', async () => {
    const { id } = await store.create({
      name: 'Drive',
      source: 'serial',
      startedAt: 0,
    });

    await store.append(id, [snapshotAt(0), snapshotAt(100)]);
    await store.append(id, []);
    await store.append(id, [snapshotAt(200, { engineRpm: null })]);

    const samples = await store.readSamples(id);

    expect(samples.map((s) => s.timestamp)).toEqual([0, 100, 200]);
    expect(samples[2]?.engineRpm).toBeNull();
    expect(samples[0]).toEqual(snapshotAt(0));
    expect((await store.get(id))?.sampleCount).toBe(3);
  });

  it('keeps sessions apart and lists them newest first', async () => {
    const older = await store.create({
      name: 'A',
      source: 'demo',
      startedAt: 1,
    });
    const newer = await store.create({
      name: 'B',
      source: 'demo',
      startedAt: 2,
    });

    await store.append(older.id, [snapshotAt(1)]);
    await store.append(newer.id, [snapshotAt(2), snapshotAt(3)]);

    expect((await store.list()).map((s) => s.name)).toEqual(['B', 'A']);
    expect(await store.readSamples(older.id)).toHaveLength(1);
    expect(await store.readSamples(newer.id)).toHaveLength(2);
  });

  it('records when a session finished', async () => {
    const { id } = await store.create({
      name: 'A',
      source: 'demo',
      startedAt: 1,
    });
    const finished = await store.finish(id, 5000);

    expect(finished.endedAt).toBe(5000);
    expect((await store.get(id))?.endedAt).toBe(5000);
  });

  it('renames a session and keeps notes with it', async () => {
    const { id } = await store.create({
      name: 'Drive',
      source: 'serial',
      startedAt: 0,
    });

    await store.append(id, [snapshotAt(0)]);

    const renamed = await store.update(id, { name: 'Hesitation at 2500' });

    expect(renamed.name).toBe('Hesitation at 2500');
    expect(renamed.notes).toBe('');

    const noted = await store.update(id, { notes: 'Stumbles off idle.' });

    expect(noted).toMatchObject({
      name: 'Hesitation at 2500',
      notes: 'Stumbles off idle.',
      sampleCount: 1,
    });
    expect(await store.get(id)).toEqual(noted);
    expect(await store.readSamples(id)).toEqual([snapshotAt(0)]);
  });

  it('removes a session and its samples', async () => {
    const keep = await store.create({
      name: 'K',
      source: 'demo',
      startedAt: 1,
    });
    const drop = await store.create({
      name: 'D',
      source: 'demo',
      startedAt: 2,
    });

    await store.append(keep.id, [snapshotAt(1)]);
    await store.append(drop.id, [snapshotAt(2)]);
    await store.remove(drop.id);
    await store.remove('no-such-session');

    expect((await store.list()).map((s) => s.id)).toEqual([keep.id]);
    expect(await store.get(drop.id)).toBeUndefined();
    expect(await store.readSamples(keep.id)).toHaveLength(1);
  });

  it('keeps writes to the ECU with a session, updated as they end, in start order', async () => {
    const { id } = await store.create({
      name: 'Pump test',
      source: 'serial',
      startedAt: 1000,
    });
    const other = await store.create({
      name: 'Other',
      source: 'serial',
      startedAt: 0,
    });

    expect(await store.readWrites(id)).toEqual([]);

    await store.putWrite(id, PUMP_RUNNING);
    await store.putWrite(id, CLEARED);

    expect(await store.readWrites(id)).toEqual([CLEARED, PUMP_RUNNING]);

    await store.putWrite(id, PUMP_STOPPED);

    expect(await store.readWrites(id)).toEqual([CLEARED, PUMP_STOPPED]);
    expect(await store.readWrites(other.id)).toEqual([]);

    await store.remove(id);
    await expect(store.readWrites(id)).rejects.toThrow(UnknownSessionError);
    await expect(store.putWrite(id, CLEARED)).rejects.toThrow(
      UnknownSessionError,
    );
  });

  it('does not share a stored write with the caller', async () => {
    const { id } = await store.create({
      name: 'Copy',
      source: 'demo',
      startedAt: 0,
    });
    const write = { ...CLEARED, outcome: { ...CLEARED.outcome } };

    await store.putWrite(id, write);
    write.endedAt = 9999;

    const [stored] = await store.readWrites(id);

    expect(stored?.endedAt).toBe(1600);
  });

  it('rejects writes and reads for an unknown session', async () => {
    await expect(store.append('missing', [snapshotAt(0)])).rejects.toThrow(
      UnknownSessionError,
    );
    await expect(store.update('missing', { name: 'A' })).rejects.toThrow(
      UnknownSessionError,
    );
    await expect(store.finish('missing', 1)).rejects.toThrow(
      UnknownSessionError,
    );
    await expect(store.readSamples('missing')).rejects.toThrow(
      UnknownSessionError,
    );
    expect(await store.list()).toEqual([]);
  });
});

describe('IndexedDbSessionStore persistence', () => {
  it('keeps sessions after the database is closed and opened again', async () => {
    const factory = new IDBFactory();
    const first = await IndexedDbSessionStore.open({ factory });
    const { id } = await first.create({
      name: 'Saved',
      source: 'serial',
      startedAt: 10,
    });

    await first.append(id, [snapshotAt(10)]);
    first.close();

    const second = await IndexedDbSessionStore.open({ factory });

    expect((await second.get(id))?.sampleCount).toBe(1);
    expect(await second.readSamples(id)).toEqual([snapshotAt(10)]);
    second.close();
  });
});

describe('IndexedDbSessionStore upgrades', () => {
  /** A database as the first release of the app left it. */
  function openVersion1(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = factory.open('cuxGauge', 1);

      req.onupgradeneeded = () => {
        req.result.createObjectStore('sessions', { keyPath: 'id' });
        req.result
          .createObjectStore('chunks', { autoIncrement: true })
          .createIndex('sessionId', 'sessionId');
      };

      req.onsuccess = () => {
        resolve(req.result);
      };

      req.onerror = () => {
        reject(new Error('open failed'));
      };
    });
  }

  it('adds empty notes to sessions recorded in format 1', async () => {
    const factory = new IDBFactory();
    const old = await openVersion1(factory);
    const tx = old.transaction(['sessions', 'chunks'], 'readwrite');

    tx.objectStore('sessions').add({
      id: 'v1-session',
      name: 'Old drive',
      source: 'serial',
      startedAt: 10,
      endedAt: 20,
      sampleCount: 1,
      formatVersion: 1,
    });
    tx.objectStore('chunks').add({
      sessionId: 'v1-session',
      samples: [snapshotAt(10)],
    });
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    old.close();

    const store = await IndexedDbSessionStore.open({ factory });

    expect(await store.list()).toEqual([
      {
        id: 'v1-session',
        name: 'Old drive',
        source: 'serial',
        startedAt: 10,
        endedAt: 20,
        sampleCount: 1,
        notes: '',
        formatVersion: 2,
      },
    ]);
    expect(await store.readSamples('v1-session')).toEqual([snapshotAt(10)]);
    // Recorded before writes were kept: none, and still in format 2.
    expect(await store.readWrites('v1-session')).toEqual([]);
    store.close();
  });
});

describe('IndexedDbSessionStore failures', () => {
  function rawOpen(factory: IDBFactory, version: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = factory.open('cuxGauge', version);

      req.onsuccess = () => {
        resolve(req.result);
      };

      req.onerror = () => {
        reject(new Error('open failed'));
      };
    });
  }

  it('refuses to open a database from a newer version of the app', async () => {
    const factory = new IDBFactory();

    (await rawOpen(factory, 5)).close();

    await expect(IndexedDbSessionStore.open({ factory })).rejects.toThrow(
      expect.objectContaining({ name: 'VersionError' }) as Error,
    );
  });

  it('steps aside when another tab upgrades the database', async () => {
    const factory = new IDBFactory();
    const store = await IndexedDbSessionStore.open({ factory });

    // Would block forever if the open store did not close itself.
    const newer = await rawOpen(factory, 5);

    expect(newer.version).toBe(5);
    newer.close();
    store.close();
  });

  it('rejects when a write fails', async () => {
    const store = await IndexedDbSessionStore.open({
      factory: new IDBFactory(),
    });
    const session = { name: 'A', source: 'demo', startedAt: 0 } as const;
    const uuid = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000000');

    await store.create(session);
    await expect(store.create(session)).rejects.toThrow(
      expect.objectContaining({ name: 'ConstraintError' }) as Error,
    );
    uuid.mockRestore();
    store.close();
  });
});

describe('openSessionStore', () => {
  it('uses IndexedDB when it is available', async () => {
    const { store, persistent } = await openSessionStore(new IDBFactory());

    expect(persistent).toBe(true);
    expect(store).toBeInstanceOf(IndexedDbSessionStore);
    store.close();
  });

  it('falls back to memory without IndexedDB, or when it will not open', async () => {
    const missing = await openSessionStore(undefined);

    expect(missing.persistent).toBe(false);
    expect(missing.store).toBeInstanceOf(MemorySessionStore);

    const factory = new IDBFactory();

    vi.spyOn(factory, 'open').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    const blocked = await openSessionStore(factory);

    expect(blocked.store).toBeInstanceOf(MemorySessionStore);
  });
});

describe.each(backends)('%s precision', (_name, open) => {
  it('keeps samples and writes exactly as given, in library units', async () => {
    const store = await open();
    const { id } = await store.create({
      name: 'Precision',
      source: 'serial',
      startedAt: 1,
    });
    const sample = snapshotAt(1_700_000_000_123, {
      throttle: 0.123456789012,
      mainVoltage: 13.987654321,
      coolantTempF: 191.0625,
      lambdaShortOdd: -0.0078125,
      engineRpm: null,
    });

    await store.append(id, [sample, { timestamp: 1_700_000_000_300 }]);
    await store.putWrite(id, PUMP_STOPPED);

    expect(await store.readSamples(id)).toEqual([
      sample,
      { timestamp: 1_700_000_000_300 },
    ]);
    expect(await store.readWrites(id)).toEqual([PUMP_STOPPED]);
    store.close();
  });
});

describe('IndexedDbSessionStore stored records', () => {
  const GOOD = {
    id: 'good',
    name: 'Good',
    source: 'serial',
    startedAt: 10,
    endedAt: 20,
    sampleCount: 0,
    notes: '',
    formatVersion: 3,
  };

  it('lists a damaged session apart, rejects reading it, and deletes it', async () => {
    const factory = new IDBFactory();

    await plantRecords(factory, {
      sessions: [GOOD, { ...GOOD, id: 'damaged', name: 42 }],
    });

    const store = await IndexedDbSessionStore.open({ factory });

    expect((await store.list()).map(({ id }) => id)).toEqual(['good']);
    expect(await store.listUnreadable()).toEqual([
      {
        id: 'damaged',
        detail: 'name: Invalid input',
      },
    ]);
    await expect(store.get('damaged')).rejects.toThrow(InvalidRecordError);
    await expect(store.readSamples('damaged')).rejects.toThrow(
      InvalidRecordError,
    );

    await store.remove('damaged');

    expect(await store.listUnreadable()).toEqual([]);
    store.close();
  });

  it('lists a session from a newer version of the app apart', async () => {
    const factory = new IDBFactory();

    await plantRecords(factory, {
      sessions: [GOOD, { ...GOOD, id: 'newer', formatVersion: 4 }],
    });

    const store = await IndexedDbSessionStore.open({ factory });

    expect((await store.list()).map(({ id }) => id)).toEqual(['good']);
    expect(await store.listUnreadable()).toEqual([
      {
        id: 'newer',
        detail: 'format 4 is from a newer version of the app',
      },
    ]);
    await expect(store.update('newer', { name: 'Renamed' })).rejects.toThrow(
      'The stored session could not be read: format 4 is from a newer version of the app',
    );
    store.close();
  });

  it('rejects damaged samples and writes rather than passing them on', async () => {
    const factory = new IDBFactory();

    await plantRecords(factory, {
      sessions: [GOOD],
      chunks: [{ sessionId: 'good', samples: [{ engineRpm: 750 }] }],
      writes: [{ ...PUMP_RUNNING, write: 'flashRom', sessionId: 'good' }],
    });

    const store = await IndexedDbSessionStore.open({ factory });

    await expect(store.readSamples('good')).rejects.toThrow(InvalidRecordError);
    await expect(store.readWrites('good')).rejects.toThrow(InvalidRecordError);
    store.close();
  });

  it('saves a format 1 session in format 2 once it is changed', async () => {
    const factory = new IDBFactory();
    const { notes: _notes, ...format1 } = { ...GOOD, formatVersion: 1 };

    await plantRecords(factory, { sessions: [format1] });

    const store = await IndexedDbSessionStore.open({ factory });

    await store.update('good', { name: 'Renamed' });
    store.close();

    const db = await openDatabase({ factory });
    const stored: unknown = await new Promise((resolve) => {
      const req = db
        .transaction('sessions', 'readonly')
        .objectStore('sessions')
        .get('good');

      req.onsuccess = () => {
        resolve(req.result);
      };
    });

    db.close();
    expect(stored).toEqual({
      ...GOOD,
      name: 'Renamed',
      notes: '',
      formatVersion: 2,
    });
  });
});
