// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot } from '../ecu/poller';
import { sessionCsv, sessionCsvFileName } from './exportCsv';

const T0 = Date.UTC(2026, 9, 5, 14, 0, 0);
const IMPERIAL = { temperatureUnit: 'F', speedUnit: 'mph' } as const;
const METRIC = { temperatureUnit: 'C', speedUnit: 'kmh' } as const;

const samples: LiveSnapshot[] = [
  { timestamp: T0, engineRpm: 750, coolantTempF: 212, milOn: false },
  { timestamp: T0 + 1500, engineRpm: null, coolantTempF: 32.5, milOn: true },
];

describe('sessionCsv', () => {
  it('writes a row per sample in imperial units', () => {
    expect(sessionCsv(samples, IMPERIAL)).toBe(
      'Time since start (s),Time (UTC),Engine speed (rpm),Coolant (°F),MIL\r\n' +
        '0,2026-10-05T14:00:00.000Z,750,212,0\r\n' +
        '1.5,2026-10-05T14:00:01.500Z,,32.5,1\r\n',
    );
  });

  it('converts to the display units without rounding', () => {
    const csv = sessionCsv(samples, METRIC).split('\r\n');

    expect(csv[0]).toContain('Coolant (°C)');
    expect(csv[1]).toBe('0,2026-10-05T14:00:00.000Z,750,100,0');
    expect(csv[2]).toBe('1.5,2026-10-05T14:00:01.500Z,,0.2777777777777778,1');
  });

  it('writes only the header for no samples', () => {
    expect(sessionCsv([], IMPERIAL)).toBe(
      'Time since start (s),Time (UTC)\r\n',
    );
  });
});

describe('sessionCsvFileName', () => {
  it('makes the name filename-safe and adds the start time', () => {
    expect(sessionCsvFileName('Warm idle: 5/10 "test"', T0)).toBe(
      'Warm-idle-5-10-test-2026-10-05T14-00-00.csv',
    );
  });

  it('falls back when nothing is left of the name', () => {
    expect(sessionCsvFileName('///', T0)).toBe(
      'session-2026-10-05T14-00-00.csv',
    );
  });
});
