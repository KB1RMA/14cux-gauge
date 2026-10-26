// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useEcuSession } from '../ecu/useEcuSession';
import { readingsFor, type MetricKey } from '../metrics';
import { useSetting } from '../settings/useSetting';
import { ReadingsContext } from './context';
import { ALWAYS_READ, chosenReadings } from '../settings/readingSettings';

/**
 * Owns which readings the user has chosen (a stored setting) and which a
 * view has asked for, and tells the ECU session what to poll.
 */
export function ReadingsProvider({ children }: { children: ReactNode }) {
  const session = useEcuSession();
  const [readingSettings, setReadingSettings] = useSetting('readings');
  // How many views have asked for each reading (see `request`).
  const [requested, setRequested] = useState<ReadonlyMap<MetricKey, number>>(
    () => new Map(),
  );
  // The readings a view has narrowed to, if any (see `focus`).
  const [focused, setFocused] = useState<readonly MetricKey[] | undefined>(
    undefined,
  );
  const chosen = useMemo(
    () => chosenReadings(readingSettings.off),
    [readingSettings.off],
  );
  // What the poller reads: the chosen readings and any a view has asked
  // for. Only the chosen ones are recorded, and only those the user picked
  // (not `ALWAYS_READ`) decide whether slow values can wait.
  const selection = useMemo(() => {
    const wanted = focused
      ? [...focused, ...ALWAYS_READ, ...requested.keys()]
      : [...chosen, ...requested.keys()];

    return {
      polled: readingsFor(wanted),
      chosen: readingsFor(chosen),
      watched: readingsFor(
        (focused ?? chosen).filter((key) => !ALWAYS_READ.includes(key)),
      ),
    };
  }, [chosen, requested, focused]);

  // The poller asks before every pass, so a change applies without
  // reconnecting.
  useEffect(() => {
    session.select(selection);
  }, [session, selection]);

  const setOff = useCallback(
    (off: MetricKey[]) => {
      setReadingSettings({ off });
    },
    [setReadingSettings],
  );

  const request = useCallback((keys: readonly MetricKey[]) => {
    const change = (by: number) => {
      setRequested((previous) => {
        const next = new Map(previous);

        for (const key of keys) {
          const count = (next.get(key) ?? 0) + by;

          if (count > 0) {
            next.set(key, count);
          } else {
            next.delete(key);
          }
        }

        return next;
      });
    };

    change(1);

    return () => {
      change(-1);
    };
  }, []);

  const focus = useCallback((keys: readonly MetricKey[]) => {
    setFocused(keys);

    // Only lifts its own narrowing, not a later view's.
    return () => {
      setFocused((current) => (current === keys ? undefined : current));
    };
  }, []);

  const value = useMemo(
    () => ({ chosen, off: readingSettings.off, setOff, request, focus }),
    [chosen, readingSettings.off, setOff, request, focus],
  );

  return <ReadingsContext value={value}>{children}</ReadingsContext>;
}
