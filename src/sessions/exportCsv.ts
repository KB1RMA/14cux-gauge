// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot } from '../ecu/poller';
import { METRICS, recordedKeys, sampleOf, type DisplayUnits } from '../metrics';

/** A CSV field, quoted when it holds a comma, quote or line break. */
function field(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * A recording as CSV, one row per sample, with the readings in the user's
 * display units. Values are converted but not rounded, so the file keeps the
 * recorded precision. A reading that was invalid, or not taken, is left
 * empty rather than written as 0. Lines end in CRLF, as RFC 4180 says.
 *
 * Columns: seconds since the first sample, the sample's ISO 8601 UTC time,
 * then each metric the recording has, headed "Label (unit)".
 */
export function sessionCsv(
  samples: readonly LiveSnapshot[],
  units: DisplayUnits,
): string {
  const keys = recordedKeys(samples);
  const metrics = METRICS.filter((metric) => keys.includes(metric.key));
  const start = samples[0]?.timestamp ?? 0;
  const header = [
    'Time since start (s)',
    'Time (UTC)',
    ...metrics.map((metric) => {
      const unit = metric.unit(units);

      return unit ? `${metric.label} (${unit})` : metric.label;
    }),
  ];
  const rows = samples.map((snapshot) => [
    String((snapshot.timestamp - start) / 1000),
    new Date(snapshot.timestamp).toISOString(),
    ...metrics.map((metric) => {
      const sample = sampleOf(snapshot, metric.key);

      return sample === null ? '' : String(metric.toDisplay(sample, units));
    }),
  ]);

  return [header, ...rows]
    .map((row) => row.map(field).join(','))
    .join('\r\n')
    .concat('\r\n');
}

/** A file name from a session's name and start, safe on any file system. */
export function sessionCsvFileName(name: string, startedAt: number): string {
  const stamp = new Date(startedAt)
    .toISOString()
    .slice(0, 19)
    .replaceAll(':', '-');
  const safe = name
    .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 60);

  return `${safe || 'session'}-${stamp}.csv`;
}
