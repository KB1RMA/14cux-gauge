// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { snapshotAt } from '../test-support/snapshots';
import { ObservableSessionStore } from './observableSessionStore';
import { MemorySessionStore } from './sessionStore';

describe('ObservableSessionStore', () => {
  it('reports changes to the list of sessions, but not appends', async () => {
    const store = new ObservableSessionStore(new MemorySessionStore());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.getVersion()).toBe(0);

    const { id } = await store.create({
      name: 'A',
      source: 'demo',
      startedAt: 0,
    });

    expect(listener).toHaveBeenCalledTimes(1);

    await store.append(id, [snapshotAt(0), snapshotAt(100)]);

    expect(listener).toHaveBeenCalledTimes(1);

    await store.finish(id, 100);
    await store.update(id, { notes: 'Cold start' });

    expect(listener).toHaveBeenCalledTimes(3);
    expect(await store.get(id)).toMatchObject({
      endedAt: 100,
      notes: 'Cold start',
      sampleCount: 2,
    });
    expect(await store.readSamples(id)).toHaveLength(2);
    expect(await store.list()).toHaveLength(1);

    await store.remove(id);

    expect(listener).toHaveBeenCalledTimes(4);
    expect(store.getVersion()).toBe(4);
    expect(await store.list()).toEqual([]);

    unsubscribe();
    await store.create({ name: 'B', source: 'demo', startedAt: 1 });

    expect(listener).toHaveBeenCalledTimes(4);
    store.close();
  });

  it('does not report a change that failed', async () => {
    const store = new ObservableSessionStore(new MemorySessionStore());
    const listener = vi.fn();

    store.subscribe(listener);

    await expect(store.update('missing', { name: 'A' })).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
