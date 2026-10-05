// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { snapshotAt } from '../test-support/snapshots';
import { countUpTo, ReplayHistory } from './replayHistory';

/** One sample a second, with the engine speed counting up from 1000. */
const samples = Array.from({ length: 10 }, (_, i) =>
  snapshotAt(i * 1000, { engineRpm: 1000 + i }),
);

describe('countUpTo', () => {
  it('counts the samples taken at or before a time', () => {
    expect(countUpTo(samples, -1)).toBe(0);
    expect(countUpTo(samples, 0)).toBe(1);
    expect(countUpTo(samples, 2500)).toBe(3);
    expect(countUpTo(samples, 9000)).toBe(10);
    expect(countUpTo(samples, 99_000)).toBe(10);
    expect(countUpTo([], 0)).toBe(0);
  });
});

describe('ReplayHistory', () => {
  it('starts empty, and adds samples as playback moves forward', () => {
    const replay = new ReplayHistory(samples);
    const versions: number[] = [];

    replay.history.subscribe(() => {
      versions.push(replay.history.getVersion());
    });

    expect(replay.history.size).toBe(0);

    replay.show(3);

    expect(replay.shownCount).toBe(3);
    expect(replay.history.window('engineRpm')).toEqual({
      times: [0, 1000, 2000],
      values: [1000, 1001, 1002],
    });

    replay.show(5);
    // Showing the same point again changes nothing.
    replay.show(5);

    expect(replay.history.window('engineRpm').values).toEqual([
      1000, 1001, 1002, 1003, 1004,
    ]);
    expect(versions).toHaveLength(5);
  });

  it('rebuilds the history when playback moves back', () => {
    const replay = new ReplayHistory(samples);

    replay.show(8);
    replay.show(2);

    expect(replay.history.window('engineRpm')).toEqual({
      times: [0, 1000],
      values: [1000, 1001],
    });

    replay.show(0);

    expect(replay.history.size).toBe(0);
  });

  it('clamps to the recording', () => {
    const replay = new ReplayHistory(samples);

    replay.show(50);

    expect(replay.shownCount).toBe(10);

    replay.show(-1);

    expect(replay.shownCount).toBe(0);
  });

  describe('with samples 20 minutes apart, then one a minute later', () => {
    const sparse = [
      snapshotAt(0, { engineRpm: 1 }),
      snapshotAt(1_200_000, { engineRpm: 2 }),
      snapshotAt(1_260_000, { engineRpm: 3 }),
    ];

    it('rebuilds from ten minutes before the newest sample', () => {
      const replay = new ReplayHistory(sparse);

      replay.show(3);
      // Moving back rebuilds, leaving out the first sample: it is 20
      // minutes older than the newest one shown.
      replay.show(2);

      expect(replay.history.window('engineRpm').values).toEqual([2]);
    });

    it('rebuilds a forward jump bigger than the buffer holds', () => {
      const replay = new ReplayHistory(sparse, 1);

      replay.show(3);

      expect(replay.history.window('engineRpm').values).toEqual([3]);
    });
  });
});
