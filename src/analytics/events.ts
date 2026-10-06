// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { EcuSource } from '../ecu/connect';
import type { ConnectionState } from '../ecu/connectionState';
import type { ErrorReason } from '../ecu/errors';

type SourceKind = EcuSource['kind'];

/**
 * Everything the app counts, besides the visit itself. Each event is a name
 * from a fixed set, never free text, so nothing typed, read from the ECU or
 * taken from an error message can be sent.
 */
export type UsageEvent =
  | `connected/${SourceKind}`
  | `connect-failed/${SourceKind}/${ErrorReason}`
  | `connection-lost/${SourceKind}/${ErrorReason}`
  | 'recording/started'
  | 'recording/saved'
  | 'recording/failed';

/** The event for a change of connection state, if it is one worth counting. */
export function connectionEvent(
  previous: ConnectionState,
  next: ConnectionState,
): UsageEvent | undefined {
  if (next === previous) {
    return undefined;
  }

  if (next.status === 'connected') {
    return `connected/${next.source.kind}`;
  }

  if (next.status === 'error') {
    const reason = next.reason ?? 'other';

    return previous.status === 'connected'
      ? `connection-lost/${next.source.kind}/${reason}`
      : `connect-failed/${next.source.kind}/${reason}`;
  }

  return undefined;
}

/** What the hook watches of a recording. */
export interface RecordingState {
  recording: boolean;
  error: string | undefined;
}

/** The events for a change of recording state; a failure also saves. */
export function recordingEvents(
  previous: RecordingState,
  next: RecordingState,
): UsageEvent[] {
  const events: UsageEvent[] = [];

  if (next.error !== undefined && next.error !== previous.error) {
    events.push('recording/failed');
  }

  if (next.recording !== previous.recording) {
    events.push(next.recording ? 'recording/started' : 'recording/saved');
  }

  return events;
}
