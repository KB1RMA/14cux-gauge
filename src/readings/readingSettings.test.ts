// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { chosenReadings, offExcept } from './readingSettings';

describe('reading settings', () => {
  it('chooses everything when nothing is off', () => {
    expect(chosenReadings([])).toHaveLength(25);
  });

  it('always includes the MIL among the chosen readings', () => {
    expect(chosenReadings(offExcept(['engineRpm']))).toEqual([
      'engineRpm',
      'milOn',
    ]);
    expect(chosenReadings(offExcept([]))).toEqual(['milOn']);
  });
});
