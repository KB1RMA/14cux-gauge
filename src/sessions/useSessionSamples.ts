// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useState } from 'react';
import type { LiveSnapshot } from '../model/snapshot';
import type { RecordedWrite } from '../model/write';
import { useSessions } from './useSessions';

export type SessionSamples =
  | { status: 'loading' }
  | { status: 'loaded'; samples: LiveSnapshot[]; writes: RecordedWrite[] }
  | { status: 'failed' };

/**
 * A session's samples and its writes to the ECU, read once. A session still
 * being recorded gives what has been saved so far.
 */
export function useSessionSamples(id: string): SessionSamples {
  const { opened, read } = useSessions();
  const [result, setResult] = useState<{
    id: string;
    samples: SessionSamples;
  }>({ id, samples: { status: 'loading' } });

  useEffect(() => {
    if (!opened) {
      return undefined;
    }

    let stale = false;

    read(id).then(
      ({ samples, writes }) => {
        if (!stale) {
          setResult({ id, samples: { status: 'loaded', samples, writes } });
        }
      },
      () => {
        if (!stale) {
          setResult({ id, samples: { status: 'failed' } });
        }
      },
    );

    return () => {
      stale = true;
    };
  }, [opened, read, id]);

  return result.id === id ? result.samples : { status: 'loading' };
}
