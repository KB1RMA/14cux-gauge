// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IDBFactory } from 'fake-indexeddb';
import { InvalidRecordError } from '../model/record';
import { plantRecords } from '../test-support/storedRecords';
import { openDatabase } from './database';
import { IndexedDbRomStore } from './indexedDbRomStore';
import { MemoryRomStore, type RomStore } from './romStore';

type Opened = RomStore & { close(): void };

/** ROM images in IndexedDB over `factory`; `close` closes the database. */
async function openIndexedDb(factory: IDBFactory): Promise<Opened> {
  const db = await openDatabase({ factory });

  return Object.assign(new IndexedDbRomStore(db), {
    close: () => {
      db.close();
    },
  });
}

const backends: [string, () => Promise<Opened>][] = [
  [
    'MemoryRomStore',
    () =>
      Promise.resolve(
        Object.assign(new MemoryRomStore(), { close: () => undefined }),
      ),
  ],
  ['IndexedDbRomStore', () => openIndexedDb(new IDBFactory())],
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
  let store: Opened;

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

  it('reports each save and remove to subscribers', async () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const saved = await store.save(rom(1000));

    expect(listener).toHaveBeenCalledTimes(1);

    await store.read(saved.id);
    await store.list();

    expect(listener).toHaveBeenCalledTimes(1);

    await store.remove(saved.id);

    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await store.save(rom(2000));

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('IndexedDbRomStore stored records', () => {
  it('lists a damaged image apart, rejects reading it, and deletes it', async () => {
    const factory = new IDBFactory();
    const roms = await openIndexedDb(factory);
    const saved = await roms.save(rom(1000));

    roms.close();

    await plantRecords(factory, {
      roms: [{ ...saved, id: 'damaged', bytes: 'not bytes' }],
    });

    const reopened = await openIndexedDb(factory);

    expect(await reopened.list()).toEqual([saved]);
    expect(await reopened.listUnreadable()).toEqual([
      { id: 'damaged', detail: 'bytes: Invalid input' },
    ]);
    await expect(reopened.read('damaged')).rejects.toThrow(InvalidRecordError);

    await reopened.remove('damaged');

    expect(await reopened.listUnreadable()).toEqual([]);
    reopened.close();
  });
});
