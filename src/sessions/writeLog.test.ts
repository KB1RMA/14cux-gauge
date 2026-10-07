// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { WriteLogEntry } from '../ecuWrite/writes';
import {
  writeDetail,
  writeLength,
  writeMarks,
  writeName,
  writeStartTime,
  writeStatus,
} from './writeLog';

const FIRST = 1_000_000;

function entry(changes: Partial<WriteLogEntry>): WriteLogEntry {
  return {
    id: 'w',
    write: 'fuelPump',
    startedAt: FIRST + 12_400,
    endedAt: FIRST + 14_500,
    outcome: { status: 'done', message: 'Fuel pump stopped.' },
    ...changes,
  };
}

describe('write log', () => {
  it('names writes, and keeps an id it does not know', () => {
    expect(writeName(entry({}))).toBe('Fuel pump test');
    expect(writeName(entry({ write: 'clearFaultCodes' }))).toBe(
      'Clear fault codes',
    );
    expect(
      writeName(entry({ write: 'futureWrite' as WriteLogEntry['write'] })),
    ).toBe('futureWrite');
  });

  it('says how each write went', () => {
    expect(writeStatus(entry({}))).toBe('Done');
    expect(writeDetail(entry({}))).toBe('Fuel pump stopped.');

    const failed = entry({
      outcome: { status: 'failed', message: 'The fuel pump test did not run.' },
    });

    expect(writeStatus(failed)).toBe('Failed');
    expect(writeDetail(failed)).toBe('The fuel pump test did not run.');
    expect(
      writeStatus(
        entry({ outcome: { status: 'partial', message: 'May have run.' } }),
      ),
    ).toBe('Partly done');

    const open = entry({ endedAt: null, outcome: { status: 'running' } });

    expect(writeStatus(open)).toBe('No end recorded');
    expect(writeDetail(open)).toBe('Still running when the recording stopped.');
  });

  it('times a write from the first sample, to a tenth of a second', () => {
    expect(writeStartTime(entry({}), FIRST)).toBe('0:12.4');
    expect(writeStartTime(entry({ startedAt: FIRST }), FIRST)).toBe('0:00.0');
    expect(
      writeStartTime(entry({ startedAt: FIRST - 1 }), FIRST),
    ).toBeUndefined();
    expect(writeLength(entry({}))).toBe('2.1 s');
    expect(writeLength(entry({ endedAt: FIRST + 12_400 }))).toBe('0.0 s');
    expect(writeLength(entry({ endedAt: null }))).toBeUndefined();
  });

  it('marks writes on the timeline, an open one to the last sample', () => {
    expect(
      writeMarks(
        [
          entry({}),
          entry({
            write: 'clearFaultCodes',
            startedAt: FIRST + 20_000,
            endedAt: null,
            outcome: { status: 'running' },
          }),
        ],
        FIRST,
        FIRST + 30_000,
      ),
    ).toEqual([
      { from: 12.4, to: 14.5, label: 'Fuel pump test', open: false },
      { from: 20, to: 30, label: 'Clear fault codes', open: true },
    ]);
  });
});
