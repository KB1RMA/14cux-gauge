// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  defaultSessionName,
  describeDuration,
  describeStorageError,
  formatDateTime,
  formatDuration,
  sourceLabel,
} from './format';

describe('session formatting', () => {
  it('names the source', () => {
    expect(sourceLabel('demo')).toBe('Demo ECU');
    expect(sourceLabel('serial')).toBe('Serial ECU');
  });

  it('formats a length of time as a clock', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5_999)).toBe('0:05');
    expect(formatDuration(754_000)).toBe('12:34');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(-50)).toBe('0:00');
  });

  it('describes a length of time in words', () => {
    expect(describeDuration(0)).toBe('0 seconds');
    expect(describeDuration(1_000)).toBe('1 second');
    expect(describeDuration(65_000)).toBe('1 minute 5 seconds');
    expect(describeDuration(7_200_000)).toBe('2 hours');
    expect(describeDuration(3_661_000)).toBe('1 hour 1 minute 1 second');
  });

  it('names a new recording after its source and start time', () => {
    const startedAt = Date.UTC(2026, 9, 5, 14, 32);

    expect(defaultSessionName('demo', startedAt)).toBe(
      `Demo ECU, ${formatDateTime(startedAt)}`,
    );
    // The date is in the user's locale; whatever the locale, it shows 2026.
    expect(formatDateTime(startedAt)).toMatch(/2026/);
  });
});

describe('describeStorageError', () => {
  it('explains a full store, and anything else plainly', () => {
    expect(
      describeStorageError(new DOMException('full', 'QuotaExceededError')),
    ).toBe(
      'The browser has no room for more samples. Delete old sessions to make space.',
    );
    expect(
      describeStorageError(new DOMException('gone', 'InvalidStateError')),
    ).toBe('The browser could not save the samples.');
  });
});
