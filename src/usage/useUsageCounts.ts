// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useRef } from 'react';
import type { ConnectionState } from '../ecu/connectionState';
import { useEcu } from '../ecu/useEcu';
import { usePreferences } from '../preferences/usePreferences';
import { useRecording } from '../recording/useRecording';
import {
  connectionEvent,
  recordingEvents,
  type RecordingState,
} from './events';
import type { UsageCounter } from './goatCounter';

/**
 * Counts the visit and the connection and recording events in `events.ts`
 * while the user allows usage counts. Only an event's name is sent.
 */
export function useUsageCounts(counter: UsageCounter | undefined): void {
  const { usageCounts } = usePreferences();
  const { state } = useEcu();
  const { active: activeRecording, error: recordingError } = useRecording();
  const active = usageCounts === 'on' ? counter : undefined;
  const connectionRef = useRef<ConnectionState>(state);
  const recordingRef = useRef<RecordingState>({
    recording: false,
    error: undefined,
  });

  useEffect(() => {
    active?.start();
  }, [active]);

  // The refs move on even while counting is off, so turning it on counts
  // only what happens from then.
  useEffect(() => {
    const previous = connectionRef.current;

    connectionRef.current = state;

    const event = connectionEvent(previous, state);

    if (active && event) {
      active.count(event);
    }
  }, [active, state]);

  useEffect(() => {
    const previous = recordingRef.current;
    const next = {
      recording: activeRecording !== undefined,
      error: recordingError,
    };

    recordingRef.current = next;

    for (const event of recordingEvents(previous, next)) {
      active?.count(event);
    }
  }, [active, activeRecording, recordingError]);
}
