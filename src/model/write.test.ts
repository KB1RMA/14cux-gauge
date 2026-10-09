// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { recordedWriteSchema, writeLogEntrySchema } from './write';

const RUNNING = {
  id: 'pump-1',
  write: 'fuelPump',
  startedAt: 2000,
  endedAt: null,
  outcome: { status: 'running' },
};

describe('writeLogEntrySchema', () => {
  it('accepts a running write and a finished one', () => {
    expect(writeLogEntrySchema.parse(RUNNING)).toEqual(RUNNING);

    const done = {
      ...RUNNING,
      endedAt: 4100,
      outcome: { status: 'partial', message: 'Clearing may be incomplete.' },
    };

    expect(writeLogEntrySchema.parse(done)).toEqual(done);
  });

  it('rejects an unknown write or an outcome without its message', () => {
    expect(
      writeLogEntrySchema.safeParse({ ...RUNNING, write: 'flashRom' }).success,
    ).toBe(false);
    expect(
      writeLogEntrySchema.safeParse({
        ...RUNNING,
        outcome: { status: 'done' },
      }).success,
    ).toBe(false);
  });
});

describe('recordedWriteSchema', () => {
  it('keeps a write or result a newer version recorded', () => {
    const newer = {
      ...RUNNING,
      write: 'flashRom',
      endedAt: 4100,
      outcome: { status: 'cancelled', message: 'Stopped by the user.' },
    };
    const noMessage = { ...newer, outcome: { status: 'cancelled' } };

    expect(recordedWriteSchema.parse(newer)).toEqual(newer);
    expect(recordedWriteSchema.parse(noMessage)).toEqual(noMessage);
    expect(recordedWriteSchema.parse(RUNNING)).toEqual(RUNNING);
  });

  it('rejects a known result in the wrong shape, and a damaged write', () => {
    expect(
      recordedWriteSchema.safeParse({
        ...RUNNING,
        outcome: { status: 'done' },
      }).success,
    ).toBe(false);
    expect(
      recordedWriteSchema.safeParse({ ...RUNNING, startedAt: '2000' }).success,
    ).toBe(false);
    expect(
      recordedWriteSchema.safeParse({ ...RUNNING, write: 7 }).success,
    ).toBe(false);
  });
});
