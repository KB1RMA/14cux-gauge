// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SampleHistory } from './sampleHistory';

describe('SampleHistory', () => {
  it('returns each series in time order, with null for invalid readings', () => {
    const history = new SampleHistory(['rpm', 'volts'], 10);

    history.push(1000, { rpm: 750, volts: 14.1 });
    history.push(1100, { rpm: 800, volts: null });
    history.push(1200, { rpm: 850 });

    expect(history.size).toBe(3);
    expect(history.latestTime).toBe(1200);
    expect(history.window('rpm')).toEqual({
      times: [1000, 1100, 1200],
      values: [750, 800, 850],
    });
    expect(history.window('volts').values).toEqual([14.1, null, null]);
  });

  it('keeps only the newest samples once full', () => {
    const history = new SampleHistory(['rpm'], 3);

    for (let i = 0; i < 5; i++) {
      history.push(i * 100, { rpm: i });
    }

    expect(history.size).toBe(3);
    expect(history.window('rpm')).toEqual({
      times: [200, 300, 400],
      values: [2, 3, 4],
    });
  });

  it('returns only the samples inside the requested window', () => {
    const history = new SampleHistory(['rpm'], 4);

    for (let i = 0; i < 7; i++) {
      history.push(i * 100, { rpm: i });
    }

    expect(history.window('rpm', 450).values).toEqual([5, 6]);
    expect(history.window('rpm', 500).values).toEqual([5, 6]);
    expect(history.window('rpm', 0).values).toEqual([3, 4, 5, 6]);
    expect(history.window('rpm', 700).values).toEqual([]);
  });

  it('notifies subscribers and bumps the version on every change', () => {
    const history = new SampleHistory(['rpm'], 4);
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);

    history.push(0, { rpm: 1 });
    history.clear();
    history.clear(); // already empty: no change

    expect(listener).toHaveBeenCalledTimes(2);
    expect(history.getVersion()).toBe(2);
    expect(history.size).toBe(0);
    expect(history.latestTime).toBeUndefined();

    unsubscribe();
    history.push(0, { rpm: 1 });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps time order if the clock goes backwards', () => {
    const history = new SampleHistory(['rpm'], 4);

    history.push(100, { rpm: 1 });
    history.push(50, { rpm: 2 });

    expect(history.window('rpm')).toEqual({
      times: [100, 100],
      values: [1, 2],
    });
  });

  it('rejects a bad capacity', () => {
    expect(() => new SampleHistory(['rpm'], 0)).toThrow(RangeError);
    expect(() => new SampleHistory(['rpm'], 1.5)).toThrow(RangeError);
  });

  it('returns an empty window for a series it does not hold', () => {
    const history = new SampleHistory<string>(['rpm'], 2);

    history.push(0, { rpm: 1 });

    expect(history.window('speed')).toEqual({ times: [], values: [] });
  });
});
