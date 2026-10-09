// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { TimelineMark } from '../charts/timelinePlugins';
import { formatTimelineTick } from '../charts/plotOptions';
import { WRITES } from '../ecuWrite/writes';
import type { RecordedWrite } from '../model/write';

/** A write's name, or its id if this version of the app does not know it. */
export function writeName(entry: RecordedWrite): string {
  // Own keys only, so a recorded id such as `toString` is not taken for one.
  return Object.hasOwn(WRITES, entry.write)
    ? WRITES[entry.write as keyof typeof WRITES].name
    : entry.write;
}

/** How a recorded write went, in a word or two. */
export function writeStatus(entry: RecordedWrite): string {
  if (entry.endedAt === null) {
    return 'No end recorded';
  }

  switch (entry.outcome.status) {
    case 'done':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'partial':
      return 'Partly done';
    case 'running':
      return 'No end recorded';
    default:
      return `Result not known: ${entry.outcome.status}`;
  }
}

/** The sentence that goes with {@link writeStatus}. */
export function writeDetail(entry: RecordedWrite): string {
  if (entry.endedAt === null || entry.outcome.status === 'running') {
    return 'Still running when the recording stopped.';
  }

  const { outcome } = entry;

  return (
    ('message' in outcome ? outcome.message : undefined) ??
    'This version of the app does not know what this result means.'
  );
}

/**
 * When a write started, as the timeline counts time from the first sample:
 * "0:12.4". `undefined` if it started before the first sample.
 */
export function writeStartTime(
  entry: RecordedWrite,
  firstSampleAt: number,
): string | undefined {
  const offset = entry.startedAt - firstSampleAt;

  return offset < 0 ? undefined : formatTimelineTick(offset / 1000, 0.1);
}

/** How long a write ran, in seconds to a tenth: "2.1 s". */
export function writeLength(entry: RecordedWrite): string | undefined {
  return entry.endedAt === null
    ? undefined
    : `${((entry.endedAt - entry.startedAt) / 1000).toFixed(1)} s`;
}

/**
 * The writes as marks on a recording's timeline, which runs from the first
 * sample at `firstSampleAt` to the last at `lastSampleAt`. A write with no
 * recorded end runs to the end of the recording.
 */
export function writeMarks(
  writes: readonly RecordedWrite[],
  firstSampleAt: number,
  lastSampleAt: number,
): TimelineMark[] {
  return writes.map((entry) => {
    const end = entry.endedAt ?? Math.max(lastSampleAt, entry.startedAt);

    return {
      from: (entry.startedAt - firstSampleAt) / 1000,
      to: (end - firstSampleAt) / 1000,
      label: writeName(entry),
      open: entry.endedAt === null,
    };
  });
}
