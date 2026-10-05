// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { EcuSource } from '../ecu/connect';

/** What a session was recorded from, as the status bar names it. */
export function sourceLabel(kind: EcuSource['kind']): string {
  return kind === 'demo' ? 'Demo ECU' : 'Serial ECU';
}

/** A length of time as a clock: "0:05", "12:34", "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');

  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${String(minutes)}:${seconds}`;
}

/** A length of time in words, for screen readers: "1 minute 5 seconds". */
export function describeDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const parts: [number, string][] = [
    [Math.floor(total / 3600), 'hour'],
    [Math.floor((total % 3600) / 60), 'minute'],
    [total % 60, 'second'],
  ];
  const words = parts
    .filter(([count]) => count > 0)
    .map(
      ([count, unit]) => `${String(count)} ${unit}${count === 1 ? '' : 's'}`,
    );

  return words.length > 0 ? words.join(' ') : '0 seconds';
}

/** A date and time in the user's locale, such as "5 Oct 2026, 14:32". */
export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(ms);
}

/** The name a recording gets until the user chooses one. */
export function defaultSessionName(
  kind: EcuSource['kind'],
  startedAt: number,
): string {
  return `${sourceLabel(kind)}, ${formatDateTime(startedAt)}`;
}

/** Turns a failed write to the session store into a sentence for the UI. */
export function describeStorageError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'The browser has no room for more samples. Delete old sessions to make space.';
  }

  return 'The browser could not save the samples.';
}
