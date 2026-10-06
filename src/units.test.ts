// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Gear } from '@kb1rma/libcomm14cux-ts';
import {
  fahrenheitToCelsius,
  formatGear,
  formatSigned,
  mphToKmh,
} from './units';

describe('units', () => {
  it('converts temperatures and speeds', () => {
    expect(fahrenheitToCelsius(212)).toBe(100);
    expect(fahrenheitToCelsius(-13)).toBe(-25);
    expect(mphToKmh(62)).toBeCloseTo(99.78, 2);
  });

  it('formats trims', () => {
    expect(formatSigned(10)).toBe('+10');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(-4)).toBe('-4');
  });

  it('names every gear', () => {
    expect(formatGear(Gear.NoReading)).toBe('No reading');
    expect(formatGear(Gear.ParkOrNeutral)).toBe('P / N');
    expect(formatGear(Gear.DriveOrReverse)).toBe('D / R');
    expect(formatGear(Gear.ManualGearbox)).toBe('Manual');
  });
});
