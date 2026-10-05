// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IDBFactory } from 'fake-indexeddb';
import { snapshotAt } from '../test-support/snapshots';
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
      formatVersion: 1,
    });
    expect(await store.get(session.id)).toEqual(session);
    expect(await store.readSamples(session.id)).toEqual([]);
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

  it('rejects writes and reads for an unknown session', async () => {
    await expect(store.append('missing', [snapshotAt(0)])).rejects.toThrow(
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
