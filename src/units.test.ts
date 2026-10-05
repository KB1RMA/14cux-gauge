// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Gear } from 'comm14cux-ts';
import {
  formatGear,
  formatPercent,
  formatSigned,
  formatSpeed,
  formatTemperature,
} from './units';

describe('units', () => {
  it('converts temperatures', () => {
    expect(formatTemperature(212, 'F')).toBe('212');
    expect(formatTemperature(212, 'C')).toBe('100');
    expect(formatTemperature(-13, 'C')).toBe('-25');
  });

  it('converts speeds', () => {
    expect(formatSpeed(62, 'mph')).toBe('62');
    expect(formatSpeed(62, 'kmh')).toBe('100');
  });

  it('formats fractions and trims', () => {
    expect(formatPercent(0.5005)).toBe('50');
    expect(formatPercent(0.1, 1)).toBe('10.0');
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
