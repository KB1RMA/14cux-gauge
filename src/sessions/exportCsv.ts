// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot } from '../model/snapshot';
import type { SessionSummary } from '../model/session';
import { METRICS, recordedKeys, sampleOf, type DisplayUnits } from '../metrics';
import { sourceLabel } from './format';
import {
  identityRows,
  NOT_RECORDED,
  notRead,
  recordedFaults,
} from './identity';

/** A CSV field, quoted when it holds a comma, quote or line break. */
function field(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function utc(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * What the recording was taken from, as leading rows: the source, then each
 * value of the ECU's identity and each fault code set, with the UTC time it
 * was read. Values are as the session page shows them, units in the label.
 */
function identitySection(
  session: Pick<SessionSummary, 'source' | 'identity'>,
): string[][] {
  const source = sourceLabel(session.source);
  const rows = [
    ['ECU at start of recording', 'Value', 'Read at (UTC)'],
    [
      'Source',
      session.source === 'demo' ? `${source} (simulated)` : source,
      '',
    ],
  ];
  const { identity } = session;

  if (identity === null) {
    return [...rows, ['ECU identity', NOT_RECORDED, '']];
  }

  for (const { label, unit, value, readAt } of identityRows(identity)) {
    rows.push([unit ? `${label} (${unit})` : label, value, utc(readAt)]);
  }

  const faults = recordedFaults(identity);

  if (faults.status === 'failed') {
    rows.push(['Fault codes', notRead(faults.message), utc(faults.readAt)]);
  } else if (faults.faults.length === 0) {
    rows.push(['Fault codes', 'None stored', utc(faults.readAt)]);
  } else {
    for (const { name, number, label } of faults.faults) {
      rows.push([
        'Fault code',
        `${number === undefined ? '' : `${number} `}${label} (${name})`,
        utc(faults.readAt),
      ]);
    }
  }

  return rows;
}

/**
 * A recording as CSV. It opens with what the recording was taken from (see
 * {@link identitySection}) and a blank line, then has one row per sample,
 * with the readings in the user's display units. Values are converted but
 * not rounded, so the file keeps the recorded precision. A reading that was
 * invalid, or not taken, is left empty rather than written as 0. Lines end
 * in CRLF, as RFC 4180 says.
 *
 * Sample columns: seconds since the first sample, the sample's ISO 8601 UTC
 * time, then each metric the recording has, headed "Label (unit)".
 */
export function sessionCsv(
  session: Pick<SessionSummary, 'source' | 'identity'>,
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
    utc(snapshot.timestamp),
    ...metrics.map((metric) => {
      const sample = sampleOf(snapshot, metric.key);

      return sample === null ? '' : String(metric.toDisplay(sample, units));
    }),
  ]);

  return [...identitySection(session), [], header, ...rows]
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
