// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { EcuIdentity } from '../model/identity';
import type { LiveSnapshot } from '../model/snapshot';
import { IDENTITY } from '../test-support/identity';
import { sessionCsv, sessionCsvFileName } from './exportCsv';

const T0 = Date.UTC(2026, 9, 5, 14, 0, 0);
const IMPERIAL = { temperatureUnit: 'F', speedUnit: 'mph' } as const;
const METRIC = { temperatureUnit: 'C', speedUnit: 'kmh' } as const;

const samples: LiveSnapshot[] = [
  { timestamp: T0, engineRpm: 750, coolantTempF: 212, milOn: false },
  { timestamp: T0 + 1500, engineRpm: null, coolantTempF: 32.5, milOn: true },
];

const SERIAL = { source: 'serial', identity: IDENTITY } as const;

/** The rows after the identity section and its blank line. */
function sampleRows(csv: string): string {
  return csv.slice(csv.indexOf('\r\n\r\n') + 4);
}

describe('sessionCsv', () => {
  it('opens with the ECU’s identity and fault codes, each with when it was read', () => {
    expect(sessionCsv(SERIAL, samples, IMPERIAL)).toBe(
      'ECU at start of recording,Value,Read at (UTC)\r\n' +
        'Source,Serial ECU,\r\n' +
        'Tune number,3360,2026-10-05T14:00:00.000Z\r\n' +
        'Tune ident,0x0021,2026-10-05T14:00:00.000Z\r\n' +
        'Checksum fixer,0x5C,2026-10-05T14:00:00.000Z\r\n' +
        'Rev limit (rpm),5800,2026-10-05T14:00:00.020Z\r\n' +
        'Fuel map,5,2026-10-05T14:00:00.040Z\r\n' +
        'Fault code,29 ROM checksum failure (romChecksumFailure),2026-10-05T14:00:00.060Z\r\n' +
        'Fault code,14 Coolant temperature sensor (coolantTempSensor),2026-10-05T14:00:00.060Z\r\n' +
        '\r\n' +
        'Time since start (s),Time (UTC),Engine speed (rpm),Coolant (°F),MIL\r\n' +
        '0,2026-10-05T14:00:00.000Z,750,212,0\r\n' +
        '1.5,2026-10-05T14:00:01.500Z,,32.5,1\r\n',
    );
  });

  it('says which values could not be read, and which were not valid', () => {
    const identity: EcuIdentity = {
      ...IDENTITY,
      tune: {
        status: 'failed',
        readAt: Date.UTC(2026, 9, 5, 14, 0, 1),
        message: 'The ECU sent an unexpected reply.',
      },
      rpmLimit: { status: 'invalid', readAt: Date.UTC(2026, 9, 5, 14, 0, 2) },
      faultCodes: {
        status: 'failed',
        readAt: Date.UTC(2026, 9, 5, 14, 0, 3),
        message: 'The connection to the ECU was closed.',
      },
    };
    const lines = sessionCsv({ source: 'serial', identity }, [], IMPERIAL)
      .split('\r\n')
      .slice(2, 8);

    expect(lines).toEqual([
      'Tune number,Not read: The ECU sent an unexpected reply.,2026-10-05T14:00:01.000Z',
      'Tune ident,Not read: The ECU sent an unexpected reply.,2026-10-05T14:00:01.000Z',
      'Checksum fixer,Not read: The ECU sent an unexpected reply.,2026-10-05T14:00:01.000Z',
      'Rev limit (rpm),Not valid,2026-10-05T14:00:02.000Z',
      'Fuel map,5,2026-10-05T14:00:00.040Z',
      'Fault codes,Not read: The connection to the ECU was closed.,2026-10-05T14:00:03.000Z',
    ]);
  });

  it('says when no fault codes were stored', () => {
    const identity: EcuIdentity = {
      ...IDENTITY,
      faultCodes: {
        status: 'read',
        readAt: Date.UTC(2026, 9, 5, 14, 0, 0),
        value: { romChecksumFailure: false },
      },
    };

    expect(
      sessionCsv({ source: 'serial', identity }, [], IMPERIAL).split('\r\n')[7],
    ).toBe('Fault codes,None stored,2026-10-05T14:00:00.000Z');
  });

  it('marks a demo recording as simulated', () => {
    expect(
      sessionCsv({ source: 'demo', identity: IDENTITY }, [], IMPERIAL).split(
        '\r\n',
      )[1],
    ).toBe('Source,Demo ECU (simulated),');
  });

  it('says an older recording did not record the ECU’s identity', () => {
    expect(
      sessionCsv({ source: 'serial', identity: null }, samples, IMPERIAL),
    ).toBe(
      'ECU at start of recording,Value,Read at (UTC)\r\n' +
        'Source,Serial ECU,\r\n' +
        'ECU identity,Not recorded,\r\n' +
        '\r\n' +
        'Time since start (s),Time (UTC),Engine speed (rpm),Coolant (°F),MIL\r\n' +
        '0,2026-10-05T14:00:00.000Z,750,212,0\r\n' +
        '1.5,2026-10-05T14:00:01.500Z,,32.5,1\r\n',
    );
  });

  it('converts to the display units without rounding', () => {
    const csv = sampleRows(sessionCsv(SERIAL, samples, METRIC)).split('\r\n');

    expect(csv[0]).toContain('Coolant (°C)');
    expect(csv[1]).toBe('0,2026-10-05T14:00:00.000Z,750,100,0');
    expect(csv[2]).toBe('1.5,2026-10-05T14:00:01.500Z,,0.2777777777777778,1');
  });

  it('writes only the header for no samples', () => {
    expect(sampleRows(sessionCsv(SERIAL, [], IMPERIAL))).toBe(
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
