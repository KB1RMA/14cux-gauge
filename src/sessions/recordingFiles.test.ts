// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IDBFactory } from 'fake-indexeddb';
import { RecordingFileError } from '../model/recordingFile';
import type { LiveSnapshot } from '../model/snapshot';
import { openDatabase } from '../storage/database';
import { IndexedDbSessionStore } from '../storage/indexedDbSessionStore';
import { MemorySessionStore } from '../storage/sessionStore';
import { IDENTITY } from '../test-support/identity';
import { snapshotAt } from '../test-support/snapshots';
import { plantRecords } from '../test-support/storedRecords';
import { openRecordings, saveRecordings } from './recordingFiles';

const START = Date.UTC(2026, 9, 5, 14, 0, 0);
const SAVED = { savedAt: Date.UTC(2026, 9, 6, 9, 30, 0), savedBy: 'Test' };

async function indexedDbStore(factory = new IDBFactory()) {
  return new IndexedDbSessionStore(await openDatabase({ factory }));
}

/** A recording with readings that do not survive a careless round trip. */
async function recordInto(store: MemorySessionStore | IndexedDbSessionStore) {
  const { id } = await store.create({
    name: 'Warm idle: 5/10',
    source: 'serial',
    startedAt: START,
    identity: IDENTITY,
  });
  const samples: LiveSnapshot[] = [
    snapshotAt(START, { lambdaShortOdd: 0.1 + 0.2, mainVoltage: 14.1 }),
    // An invalid reading, and readings that were not taken.
    { timestamp: START + 333.25, engineRpm: null, coolantTempF: 1 / 3 },
    snapshotAt(START + 700, { throttle: Number.MIN_VALUE }),
  ];

  await store.append(id, samples);
  await store.putWrite(id, {
    id: 'clear-1',
    write: 'clearFaultCodes',
    startedAt: START + 100,
    endedAt: START + 200,
    outcome: { status: 'done', message: 'Fault codes cleared.' },
  });
  await store.update(id, { notes: 'Lambda swings at idle.' });
  await store.finish(id, START + 700);

  return { id, samples };
}

describe.each([
  ['MemorySessionStore', () => Promise.resolve(new MemorySessionStore())],
  ['IndexedDbSessionStore', () => indexedDbStore()],
])('Saving and opening recordings with %s', (_name, open) => {
  it('opens a saved recording with identical samples, notes, identity and writes', async () => {
    const store = await open();
    const { id, samples } = await recordInto(store);

    const file = await saveRecordings(store, [id], SAVED);

    expect(file.name).toBe('Warm-idle-5-10-2026-10-05T14-00-00.json');

    const other = await open();
    const [opened] = await openRecordings(
      other,
      { name: 'warm idle.json', text: file.text },
      SAVED.savedAt + 1000,
    );

    expect(opened).toEqual({
      id: expect.any(String) as string,
      name: 'Warm idle: 5/10',
      notes: 'Lambda swings at idle.',
      source: 'serial',
      startedAt: START,
      endedAt: START + 700,
      sampleCount: 3,
      identity: IDENTITY,
      writesKept: true,
      imported: {
        fileName: 'warm idle.json',
        importedAt: SAVED.savedAt + 1000,
        savedAt: SAVED.savedAt,
        savedBy: 'Test',
      },
      formatVersion: 5,
    });

    const back = await other.readSamples(opened?.id ?? '');

    expect(back).toEqual(samples);
    expect(back[0]?.lambdaShortOdd).toBe(0.30000000000000004);
    expect(back[1]?.coolantTempF).toBe(0.3333333333333333);
    expect(back[1]?.engineRpm).toBeNull();
    expect(back[1]).not.toHaveProperty('throttle');
    expect(back[2]?.throttle).toBe(5e-324);
    expect(await other.readWrites(opened?.id ?? '')).toEqual([
      {
        id: expect.any(String) as string,
        write: 'clearFaultCodes',
        startedAt: START + 100,
        endedAt: START + 200,
        outcome: { status: 'done', message: 'Fault codes cleared.' },
      },
    ]);
  });

  it('saves several sessions in one file, in the order chosen', async () => {
    const store = await open();
    const first = await recordInto(store);
    const { id: second } = await store.create({
      name: 'Cold start',
      source: 'demo',
      startedAt: START + 60_000,
      identity: null,
    });

    const file = await saveRecordings(store, [second, first.id], SAVED);

    expect(file.name).toBe('14CUX-recordings-2026-10-06T09-30-00.json');

    const opened = await openRecordings(
      await open(),
      { name: 'both.json', text: file.text },
      0,
    );

    expect(opened.map(({ name, endedAt }) => [name, endedAt])).toEqual([
      ['Cold start', null],
      ['Warm idle: 5/10', START + 700],
    ]);
  });

  it('opens nothing from a file with any recording it cannot read', async () => {
    const store = await open();
    const { id } = await recordInto(store);
    const { text } = await saveRecordings(store, [id, id], SAVED);
    const damaged = JSON.parse(text) as {
      recordings: { samples: Record<string, unknown>[] }[];
    };
    const second = damaged.recordings[1];

    if (second?.samples[2]) {
      second.samples[2]['mainVoltage'] = 'high';
    }

    const other = await open();

    await expect(
      openRecordings(
        other,
        { name: 'two.json', text: JSON.stringify(damaged) },
        0,
      ),
    ).rejects.toThrow(
      new RecordingFileError(
        'two.json',
        'it is damaged (recordings.1.samples.2.mainVoltage: Invalid input)',
      ),
    );
    expect(await other.list()).toEqual([]);
  });

  it('rejects saving a session that is not stored', async () => {
    await expect(
      saveRecordings(await open(), ['missing'], SAVED),
    ).rejects.toThrow('No recorded session with id missing');
  });
});

describe('Saving older sessions', () => {
  it('keeps a session from before writes and identities were recorded as such', async () => {
    const factory = new IDBFactory();

    await plantRecords(factory, {
      sessions: [
        {
          id: 'old',
          name: 'Old drive',
          source: 'demo',
          startedAt: START,
          endedAt: START + 100,
          sampleCount: 1,
          notes: '',
          formatVersion: 2,
        },
      ],
      chunks: [{ sessionId: 'old', samples: [snapshotAt(START)] }],
    });

    const store = await indexedDbStore(factory);
    const file = await saveRecordings(store, ['old'], SAVED);
    const [opened] = await openRecordings(
      store,
      { name: 'old.json', text: file.text },
      0,
    );

    expect(opened).toMatchObject({
      identity: null,
      writesKept: false,
      formatVersion: 5,
    });
    expect(await store.readSamples(opened?.id ?? '')).toEqual([
      snapshotAt(START),
    ]);
  });
});
