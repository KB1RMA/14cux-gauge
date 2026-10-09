// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { writeLogEntrySchema } from './write';

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
