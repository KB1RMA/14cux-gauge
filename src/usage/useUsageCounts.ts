// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect } from 'react';
import { usePreferences } from '../preferences/usePreferences';
import { useServices } from '../services/useServices';
import {
  connectionEvent,
  recordingEvents,
  type RecordingState,
} from './events';
import type { UsageCounter } from './goatCounter';

/**
 * Counts the visit and the connection and recording events in `events.ts`
 * while the user allows usage counts, as the session and the recorder report
 * them. Only an event's name is sent.
 */
export function useUsageCounts(counter: UsageCounter | undefined): void {
  const { usageCounts } = usePreferences();
  const { session, recorder } = useServices();
  const active = usageCounts === 'on' ? counter : undefined;

  useEffect(() => {
    active?.start();
  }, [active]);

  // Counting starts from what each controller holds when it is turned on, so
  // only what happens from then is counted.
  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let previous = session.getSnapshot().connection;

    return session.subscribe(() => {
      const { connection } = session.getSnapshot();
      const event = connectionEvent(previous, connection);

      previous = connection;

      if (event) {
        active.count(event);
      }
    });
  }, [active, session]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const stateOf = (): RecordingState => {
      const { active: recording, error } = recorder.getSnapshot();

      return { recording: recording !== undefined, error };
    };

    let previous = stateOf();

    return recorder.subscribe(() => {
      const next = stateOf();

      for (const event of recordingEvents(previous, next)) {
        active.count(event);
      }

      previous = next;
    });
  }, [active, recorder]);
}
