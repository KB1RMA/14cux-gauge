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

  it('grows past its first allocation, keeping every sample', () => {
    const history = new SampleHistory(['rpm'], 5000);

    for (let i = 0; i < 3000; i++) {
      history.push(i, { rpm: i });
    }

    expect(history.size).toBe(3000);
    expect(history.truncated).toBe(false);
    expect(history.earliestTime).toBe(0);
    expect(history.window('rpm', 2998).values).toEqual([2998, 2999]);
    expect(history.window('rpm').values.slice(0, 3)).toEqual([0, 1, 2]);
  });

  it('says when samples have been dropped, until cleared', () => {
    const history = new SampleHistory(['rpm'], 3);

    for (let i = 0; i < 3; i++) {
      history.push(i * 100, { rpm: i });
    }

    expect(history.truncated).toBe(false);

    history.push(300, { rpm: 3 });

    expect(history.truncated).toBe(true);
    expect(history.earliestTime).toBe(100);

    history.clear();

    expect(history.truncated).toBe(false);
    expect(history.earliestTime).toBeUndefined();
  });

  describe('thinned', () => {
    it('keeps each bucket’s first, lowest, highest and last sample, in time order', () => {
      const history = new SampleHistory(['rpm'], 100);
      const rpm = [800, 900, 400, 850, 820, 810, 1200, 805];

      rpm.forEach((value, i) => {
        history.push(i * 10, { rpm: value });
      });

      // Buckets of 40 ms: 0–30 and 40–70.
      expect(history.thinned('rpm', -Infinity, 40)).toEqual({
        times: [0, 10, 20, 30, 40, 60, 70],
        values: [800, 900, 400, 850, 820, 1200, 805],
      });
    });

    it('keeps one null for each run of invalid samples, and never joins across it', () => {
      const history = new SampleHistory(['volts'], 100);
      const volts = [14.1, null, null, 13.9, 14.0, null, 14.2, 14.3];

      volts.forEach((value, i) => {
        history.push(i * 10, { volts: value });
      });

      expect(history.thinned('volts', -Infinity, 1000)).toEqual({
        times: [0, 10, 30, 40, 50, 60, 70],
        values: [14.1, null, 13.9, 14.0, null, 14.2, 14.3],
      });
    });

    it('aligns buckets to time, so scrolling does not change them', () => {
      const history = new SampleHistory(['rpm'], 100);

      for (let i = 0; i < 10; i++) {
        history.push(i * 10, { rpm: i === 5 ? 0 : 100 + i });
      }

      // From 25 ms: the bucket 0–49 holds only 30 and 40 now.
      expect(history.thinned('rpm', 25, 50)).toEqual({
        times: [30, 40, 50, 90],
        values: [103, 104, 0, 109],
      });
    });

    it('returns every sample when no bucket holds more than one', () => {
      const history = new SampleHistory(['rpm'], 100);

      history.push(0, { rpm: 1 });
      history.push(100, { rpm: 2 });

      expect(history.thinned('rpm', -Infinity, 64)).toEqual({
        times: [0, 100],
        values: [1, 2],
      });
      expect(history.thinned('missing' as 'rpm', -Infinity, 64)).toEqual({
        times: [],
        values: [],
      });
    });
  });

  describe('reading a stretch', () => {
    function filled() {
      const history = new SampleHistory(['rpm'], 100);

      // 0..50 ms in 10 ms steps; the reading at 30 ms is invalid.
      for (let i = 0; i <= 5; i++) {
        history.push(i * 10, { rpm: i === 3 ? null : 100 + i });
      }

      return history;
    }

    it('limits a window at both ends, inclusive', () => {
      expect(filled().window('rpm', 10, 40)).toEqual({
        times: [10, 20, 30, 40],
        values: [101, 102, null, 104],
      });
    });

    it('limits thinned samples at both ends, and can keep one either side', () => {
      const history = filled();

      expect(history.thinned('rpm', 15, 1, 35).times).toEqual([20, 30]);
      expect(history.thinned('rpm', 15, 1, 35, true)).toEqual({
        times: [10, 20, 30, 40],
        values: [101, 102, null, 104],
      });
      // No sample beyond the ends to keep.
      expect(
        history.thinned('rpm', -Infinity, 1, Infinity, true).times,
      ).toEqual([0, 10, 20, 30, 40, 50]);
    });

    it('reads the last sample at or before a time', () => {
      const history = filled();

      expect(history.valueAt('rpm', -1)).toBeUndefined();
      expect(history.valueAt('rpm', 0)).toBe(100);
      expect(history.valueAt('rpm', 25)).toBe(102);
      expect(history.valueAt('rpm', 30)).toBeNull();
      expect(history.valueAt('rpm', 999)).toBe(105);
      expect(new SampleHistory(['rpm'], 4).valueAt('rpm', 0)).toBeUndefined();
    });
  });
});
