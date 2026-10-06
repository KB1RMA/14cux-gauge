// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  chosenReadings,
  offExcept,
  parseReadingSettings,
} from './readingSettings';

describe('reading settings', () => {
  it('reads everything by default', () => {
    expect(parseReadingSettings(undefined)).toEqual({ off: [] });
    expect(chosenReadings([])).toHaveLength(21);
  });

  it('keeps only known readings, and never turns the MIL off', () => {
    expect(
      parseReadingSettings({ off: ['fuelTempF', 'milOn', 'warpDrive', 3] }),
    ).toEqual({ off: ['fuelTempF'] });
    expect(parseReadingSettings({ off: 'fuelTempF' })).toEqual({ off: [] });
  });

  it('always includes the MIL among the chosen readings', () => {
    expect(chosenReadings(offExcept(['engineRpm']))).toEqual([
      'engineRpm',
      'milOn',
    ]);
    expect(chosenReadings(offExcept([]))).toEqual(['milOn']);
  });
});
