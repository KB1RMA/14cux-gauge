// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { formatRecentEntries, formatReport, reportFileName } from './report';

const STARTED = Date.UTC(2026, 9, 6, 14, 0, 0);

const CONTEXT = {
  generatedAt: STARTED + 90_000,
  build: { version: '0.1.1', commit: 'abc1234', releaseTag: 'v0.1.1' },
  userAgent: 'TestBrowser/1.0',
  webSerial: true,
  connection: 'error (serial): The ECU stopped responding.',
};

describe('formatReport', () => {
  it('describes the environment, then lists every entry with its time', () => {
    const text = formatReport(
      {
        startedAt: STARTED,
        head: [
          { time: STARTED + 1_500, kind: 'event', message: 'Opening port' },
          { time: STARTED + 1_502, kind: 'tx', message: '04' },
        ],
        dropped: 0,
        tail: [],
      },
      CONTEXT,
    );

    expect(text).toBe(
      [
        '14CUX Gauge diagnostic log',
        'Generated:   2026-10-06T14:01:30.000Z',
        'Log started: 2026-10-06T14:00:00.000Z',
        'App:         v0.1.1 (abc1234)',
        'Browser:     TestBrowser/1.0',
        'Web Serial:  available',
        'Connection:  error (serial): The ECU stopped responding.',
        '',
        'Times are UTC. TX is sent to the ECU, RX is received from it (with how',
        'long the read took), ERR is a failure.',
        'Bytes are hexadecimal. Demo mode traffic is not recorded.',
        '',
        '2026-10-06T14:00:01.500Z     Opening port',
        '2026-10-06T14:00:01.502Z TX  04',
        '',
      ].join('\n'),
    );
  });

  it('marks where entries were dropped between the head and the tail', () => {
    const text = formatReport(
      {
        startedAt: STARTED,
        head: [{ time: STARTED, kind: 'tx', message: '04' }],
        dropped: 42,
        tail: [{ time: STARTED + 60_000, kind: 'error', message: 'Timeout' }],
      },
      {
        ...CONTEXT,
        build: { version: '0.2.0', commit: null, releaseTag: null },
        webSerial: false,
      },
    );

    expect(text).toContain(
      'App:         development build of 0.2.0 (unknown commit)',
    );
    expect(text).toContain('Web Serial:  not available');
    expect(text).toContain(
      [
        '2026-10-06T14:00:00.000Z TX  04',
        '… 42 entries omitted to save memory …',
        '2026-10-06T14:01:00.000Z ERR Timeout',
      ].join('\n'),
    );
  });
});

describe('reportFileName', () => {
  it('stamps the time in a form every file system accepts', () => {
    expect(reportFileName(STARTED + 7_000)).toBe(
      '14cux-gauge-log-2026-10-06T14-00-07.txt',
    );
  });
});

describe('formatRecentEntries', () => {
  it('lists only the latest entries, across the head and tail', () => {
    expect(
      formatRecentEntries(
        {
          startedAt: STARTED,
          head: [
            { time: STARTED, kind: 'tx', message: '04' },
            { time: STARTED + 1, kind: 'rx', message: '04 (1 ms)' },
          ],
          dropped: 5,
          tail: [{ time: STARTED + 2_000, kind: 'error', message: 'Timeout' }],
        },
        2,
      ),
    ).toBe(
      [
        '2026-10-06T14:00:00.001Z RX  04 (1 ms)',
        '2026-10-06T14:00:02.000Z ERR Timeout',
      ].join('\n'),
    );
  });
});
