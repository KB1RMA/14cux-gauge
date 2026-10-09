// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Gear, PurgeValveState } from '@kb1rma/libcomm14cux-ts';
import { snapshotAt } from '../test-support/snapshots';
import { isSnapshotLike, liveSnapshotSchema } from './snapshot';

describe('the stored encoding of enumerated readings', () => {
  // Recordings keep these as the library's numbers. If the library ever
  // renumbers them, old recordings would read wrongly: this must fail first,
  // and the session format must change with a migration.
  it('keeps the gear numbers recordings were made with', () => {
    expect(Gear).toEqual({
      NoReading: 0,
      ParkOrNeutral: 1,
      DriveOrReverse: 2,
      ManualGearbox: 3,
    });
  });

  it('keeps the purge valve numbers recordings were made with', () => {
    expect(PurgeValveState).toEqual({ Closed: 0, Toggling: 1, Open: 2 });
  });
});

describe('liveSnapshotSchema', () => {
  it('accepts a full snapshot unchanged, at full precision', () => {
    const snapshot = snapshotAt(1_700_000_000_123, {
      throttle: 0.123456789,
      mainVoltage: 13.987654321,
    });

    expect(liveSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('keeps a reading that was not taken apart from an invalid one', () => {
    const parsed = liveSnapshotSchema.parse({
      timestamp: 5,
      engineRpm: null,
    });

    expect(parsed).toEqual({ timestamp: 5, engineRpm: null });
    expect('engineRpm' in parsed).toBe(true);
    expect('coolantTempF' in parsed).toBe(false);
  });

  it('rejects readings of the wrong kind', () => {
    expect(
      liveSnapshotSchema.safeParse({ timestamp: 5, gear: 7 }).success,
    ).toBe(false);
    expect(
      liveSnapshotSchema.safeParse({ timestamp: 5, engineRpm: '750' }).success,
    ).toBe(false);
    expect(liveSnapshotSchema.safeParse({ engineRpm: 750 }).success).toBe(
      false,
    );
  });
});

describe('isSnapshotLike', () => {
  it('accepts an object with a numeric time', () => {
    expect(isSnapshotLike({ timestamp: 0 })).toBe(true);
    expect(isSnapshotLike(snapshotAt(10))).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSnapshotLike(null)).toBe(false);
    expect(isSnapshotLike(10)).toBe(false);
    expect(isSnapshotLike({ timestamp: '10' })).toBe(false);
    expect(isSnapshotLike({})).toBe(false);
  });
});
