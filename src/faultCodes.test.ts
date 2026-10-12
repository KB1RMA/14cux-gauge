// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { activeFaults, describeFault } from './faultCodes';

describe('activeFaults', () => {
  it('lists the codes set in priority order, numbered as the factory does', () => {
    expect(
      activeFaults({
        coolantTempSensor: true,
        lambdaSensorOdd: false,
        romChecksumFailure: true,
      }),
    ).toEqual([
      {
        name: 'romChecksumFailure',
        number: '29',
        label: 'ROM checksum failure',
      },
      {
        name: 'coolantTempSensor',
        number: '14',
        label: 'Coolant temperature sensor',
      },
    ]);
  });

  it('keeps a code a newer version recorded, after the known ones', () => {
    expect(
      activeFaults({
        futureFault: true,
        purgeValveLeak: true,
        otherNew: false,
      }),
    ).toEqual([
      { name: 'purgeValveLeak', number: '88', label: 'Purge valve leak' },
      { name: 'futureFault', number: undefined, label: 'Unknown fault code' },
    ]);
  });

  it('lists nothing when no code is set', () => {
    expect(activeFaults({ romChecksumFailure: false })).toEqual([]);
  });
});

describe('describeFault', () => {
  it('notes which firmware sets a code', () => {
    expect(describeFault('misfireGeneral').label).toBe(
      'Misfire (set only by firmware before R3360)',
    );
  });
});
