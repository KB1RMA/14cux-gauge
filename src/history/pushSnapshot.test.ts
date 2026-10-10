// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { snapshotAt } from '../test-support/snapshots';
import { historyOf } from './pushSnapshot';

describe('historyOf', () => {
  it('holds every sample at full precision in library units, invalid ones as gaps', () => {
    const history = historyOf([
      snapshotAt(1000, { engineRpm: 812.5, coolantTempF: 199.4 }),
      snapshotAt(1100, { engineRpm: null, milOn: true }),
      // Not read at all: also no value.
      { timestamp: 1200 },
    ]);

    expect(history.size).toBe(3);
    expect(history.window('engineRpm')).toEqual({
      times: [1000, 1100, 1200],
      values: [812.5, null, null],
    });
    expect(history.window('coolantTempF').values).toEqual([199.4, 190, null]);
    expect(history.window('milOn').values).toEqual([0, 1, null]);
  });

  it('is empty for no samples', () => {
    expect(historyOf([]).size).toBe(0);
  });
});
