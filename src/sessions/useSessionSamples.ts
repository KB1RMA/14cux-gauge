// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useState } from 'react';
import type { LiveSnapshot } from '../ecu/poller';
import { useSessions } from './useSessions';

export type SessionSamples =
  | { status: 'loading' }
  | { status: 'loaded'; samples: LiveSnapshot[] }
  | { status: 'failed' };

/**
 * A session's samples, read once. A session still being recorded gives the
 * samples written so far.
 */
export function useSessionSamples(id: string): SessionSamples {
  const { store } = useSessions();
  const [result, setResult] = useState<{
    id: string;
    samples: SessionSamples;
  }>({ id, samples: { status: 'loading' } });

  useEffect(() => {
    if (!store) {
      return undefined;
    }

    let stale = false;

    store.readSamples(id).then(
      (samples) => {
        if (!stale) {
          setResult({ id, samples: { status: 'loaded', samples } });
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
  }, [store, id]);

  return result.id === id ? result.samples : { status: 'loading' };
}
