// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { WriteLogEntry } from '../ecuWrite/writes';
import { MemorySessionStore } from '../storage/sessionStore';
import { snapshotAt } from '../test-support/snapshots';
import { SessionRecorder } from './sessionRecorder';

const NEW_SESSION = { name: 'Test', source: 'demo', startedAt: 0 } as const;

function pumpWrite(id: string, endedAt: number | null): WriteLogEntry {
  return {
    id,
    write: 'fuelPump',
    startedAt: 500,
    endedAt,
    outcome:
      endedAt === null
        ? { status: 'running' }
        : { status: 'done', message: 'Fuel pump stopped.' },
  };
}

describe('SessionRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes buffered samples on a timer, in batches', async () => {
    const store = new MemorySessionStore();
    const append = vi.spyOn(store, 'append');
    const recorder = await SessionRecorder.start(store, NEW_SESSION, {
      flushIntervalMs: 1000,
    });

    recorder.push(snapshotAt(0));
    recorder.push(snapshotAt(100));

    expect(append).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(append).toHaveBeenCalledTimes(1);
    expect(await store.readSamples(recorder.session.id)).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1000); // nothing new to write

    expect(append).toHaveBeenCalledTimes(1);
    await recorder.stop();
  });

  it('writes early once enough samples are buffered', async () => {
    const store = new MemorySessionStore();
    const recorder = await SessionRecorder.start(store, NEW_SESSION, {
      maxBuffered: 3,
    });

    for (let i = 0; i < 3; i++) {
      recorder.push(snapshotAt(i));
    }

    await recorder.flush();

    expect((await store.get(recorder.session.id))?.sampleCount).toBe(3);
    await recorder.stop();
  });

  it('writes what is left on stop, finishes the session and ignores later samples', async () => {
    const store = new MemorySessionStore();
    const recorder = await SessionRecorder.start(store, NEW_SESSION);

    recorder.push(snapshotAt(0));

    const summary = await recorder.stop(4000);

    recorder.push(snapshotAt(5000));
    await recorder.flush();

    expect(summary).toMatchObject({ endedAt: 4000, sampleCount: 1 });
    expect(recorder.recording).toBe(false);
    expect(await store.readSamples(recorder.session.id)).toEqual([
      snapshotAt(0),
    ]);
  });

  it('reports the first failed write and stops recording', async () => {
    const store = new MemorySessionStore();
    const onError = vi.fn();
    const recorder = await SessionRecorder.start(store, NEW_SESSION, {
      onError,
    });
    const failure = new DOMException('full', 'QuotaExceededError');

    vi.spyOn(store, 'append').mockRejectedValue(failure);
    recorder.push(snapshotAt(0));
    await recorder.flush();
    recorder.push(snapshotAt(1));
    await recorder.flush();

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(recorder.recording).toBe(false);
  });

  it('drops batches already queued behind a failed write', async () => {
    const store = new MemorySessionStore();
    const recorder = await SessionRecorder.start(store, NEW_SESSION);
    const append = vi
      .spyOn(store, 'append')
      .mockRejectedValue(new Error('disk full'));

    recorder.push(snapshotAt(0));
    void recorder.flush();
    recorder.push(snapshotAt(1));
    await recorder.flush();

    expect(append).toHaveBeenCalledTimes(1);
  });

  it('keeps writes it saw start, with their ends while it records', async () => {
    const store = new MemorySessionStore();
    const recorder = await SessionRecorder.start(store, NEW_SESSION);
    const { id } = recorder.session;

    recorder.recordWrite(pumpWrite('a', null));
    await recorder.flush();

    expect(await store.readWrites(id)).toEqual([pumpWrite('a', null)]);

    recorder.recordWrite(pumpWrite('a', 2600));
    // The end of a write it never saw start, such as one on an earlier
    // connection, is not kept.
    recorder.recordWrite(pumpWrite('earlier', 2700));
    recorder.recordWrite(pumpWrite('b', null));
    await recorder.stop();
    // Ends after recording stopped are not kept: b has no recorded end.
    recorder.recordWrite(pumpWrite('b', 3000));
    recorder.recordWrite(pumpWrite('c', null));
    await recorder.flush();

    expect(await store.readWrites(id)).toEqual([
      pumpWrite('a', 2600),
      pumpWrite('b', null),
    ]);
  });

  it('stops keeping writes once saving fails', async () => {
    const store = new MemorySessionStore();
    const onError = vi.fn();
    const recorder = await SessionRecorder.start(store, NEW_SESSION, {
      onError,
    });

    vi.spyOn(store, 'putWrite').mockRejectedValueOnce(new Error('full'));
    recorder.recordWrite(pumpWrite('a', null));
    await recorder.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(recorder.recording).toBe(false);
    recorder.recordWrite(pumpWrite('b', null));
    await recorder.flush();
    expect(await store.readWrites(recorder.session.id)).toEqual([]);
  });
});
