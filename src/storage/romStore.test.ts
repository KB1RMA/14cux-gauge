// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbRomStore } from './indexedDbRomStore';
import { IndexedDbSessionStore } from './indexedDbSessionStore';
import { openRomStore } from './openRomStore';
import { MemoryRomStore, type RomStore } from './romStore';

const backends: [string, () => Promise<RomStore>][] = [
  ['MemoryRomStore', () => Promise.resolve(new MemoryRomStore())],
  [
    'IndexedDbRomStore',
    () => IndexedDbRomStore.open({ factory: new IDBFactory() }),
  ],
];

const BYTES = Uint8Array.from([0x00, 0x7f, 0x80, 0xff]);

function rom(readAt: number, bytes = BYTES) {
  return {
    source: 'serial' as const,
    readAt,
    tuneNumber: 3652,
    tuneIdent: 0x23,
    sha256: 'ab12',
    bytes,
  };
}

describe.each(backends)('%s', (_name, open) => {
  let store: RomStore;

  beforeEach(async () => {
    store = await open();
  });

  afterEach(() => {
    store.close();
  });

  it('keeps an image byte for byte, with its details', async () => {
    const saved = await store.save(rom(1000));

    expect(saved).toEqual({
      id: expect.any(String) as string,
      source: 'serial',
      readAt: 1000,
      tuneNumber: 3652,
      tuneIdent: 0x23,
      sha256: 'ab12',
      size: 4,
    });
    expect([...((await store.read(saved.id)) ?? [])]).toEqual([
      0x00, 0x7f, 0x80, 0xff,
    ]);
    expect(await store.list()).toEqual([saved]);
  });

  it('lists the newest image first', async () => {
    const older = await store.save(rom(1000));
    const newer = await store.save(rom(2000));

    expect((await store.list()).map(({ id }) => id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('is not changed by later changes to the array it was given', async () => {
    const bytes = Uint8Array.from(BYTES);
    const saved = await store.save(rom(1000, bytes));

    bytes[0] = 0x55;
    expect((await store.read(saved.id))?.[0]).toBe(0x00);
  });

  it('forgets a removed image, and ignores an unknown one', async () => {
    const saved = await store.save(rom(1000));

    await store.remove(saved.id);
    await store.remove('unknown');

    expect(await store.list()).toEqual([]);
    expect(await store.read(saved.id)).toBeUndefined();
  });
});

describe('IndexedDbRomStore', () => {
  it('shares its database with recorded sessions', async () => {
    const factory = new IDBFactory();
    const roms = await IndexedDbRomStore.open({ factory });
    const sessions = await IndexedDbSessionStore.open({ factory });

    const saved = await roms.save(rom(1000));
    const session = await sessions.create({
      name: 'Idle',
      source: 'demo',
      startedAt: 5,
    });

    expect(await roms.list()).toHaveLength(1);
    expect((await sessions.list()).map(({ id }) => id)).toEqual([session.id]);
    expect(saved.size).toBe(4);
    roms.close();
    sessions.close();
  });
});

describe('openRomStore', () => {
  it('opens IndexedDB when it is there', async () => {
    const { store, persistent } = await openRomStore(new IDBFactory());

    expect(persistent).toBe(true);
    store.close();
  });

  it('falls back to memory without IndexedDB', async () => {
    const { store, persistent } = await openRomStore(undefined);

    expect(persistent).toBe(false);
    expect(store).toBeInstanceOf(MemoryRomStore);
  });
});
