// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { TimeoutError } from 'comm14cux-ts';
import {
  DiagnosticLog,
  describeRawError,
  toHex,
  type DiagnosticEntry,
} from './diagnosticLog';

function clock(start = 1_000) {
  let time = start;

  return () => time++;
}

const messages = (entries: readonly DiagnosticEntry[]) =>
  entries.map((entry) => entry.message);

describe('DiagnosticLog', () => {
  it('records entries with their time and kind', () => {
    const log = new DiagnosticLog({ now: clock() });

    log.record('tx', '5A');
    log.record('rx', '5A 10 (2 ms)');

    expect(log.snapshot()).toEqual({
      startedAt: 1_000,
      head: [
        { time: 1_001, kind: 'tx', message: '5A' },
        { time: 1_002, kind: 'rx', message: '5A 10 (2 ms)' },
      ],
      dropped: 0,
      tail: [],
    });
  });

  it('keeps the first entries and a rolling window of the latest', () => {
    const log = new DiagnosticLog({
      headCapacity: 2,
      tailCapacity: 3,
      now: clock(),
    });

    for (let i = 1; i <= 8; i++) {
      log.record('tx', `#${String(i)}`);
    }

    const snapshot = log.snapshot();

    expect(messages(snapshot.head)).toEqual(['#1', '#2']);
    expect(snapshot.dropped).toBe(3);
    expect(messages(snapshot.tail)).toEqual(['#6', '#7', '#8']);
  });

  it('keeps the tail in order before it wraps', () => {
    const log = new DiagnosticLog({ headCapacity: 1, tailCapacity: 3 });

    log.record('event', 'a');
    log.record('event', 'b');
    log.record('event', 'c');

    expect(messages(log.snapshot().tail)).toEqual(['b', 'c']);
  });

  it('mirrors events and errors but not bytes', () => {
    const mirror = vi.fn<(entry: DiagnosticEntry) => void>();
    const log = new DiagnosticLog({ mirror, now: () => 5 });

    log.record('event', 'Opening serial port');
    log.record('tx', '5A');
    log.record('rx', '10 (1 ms)');
    log.record('error', 'Write failed');

    expect(mirror.mock.calls).toEqual([
      [{ time: 5, kind: 'event', message: 'Opening serial port' }],
      [{ time: 5, kind: 'error', message: 'Write failed' }],
    ]);
  });
});

describe('toHex', () => {
  it('writes bytes as padded upper-case hex', () => {
    expect(toHex(Uint8Array.of(0x00, 0x0a, 0xff, 0x5a))).toBe('00 0A FF 5A');
  });
});

describe('describeRawError', () => {
  it('gives the name and message of an error', () => {
    expect(describeRawError(new TimeoutError('No data'))).toBe(
      'TimeoutError: No data',
    );
    expect(
      describeRawError(new DOMException('Device lost.', 'NetworkError')),
    ).toBe('NetworkError: Device lost.');
  });

  it('stringifies anything else', () => {
    expect(describeRawError('boom')).toBe('boom');
  });
});
