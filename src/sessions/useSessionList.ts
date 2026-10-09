// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { UnreadableRecord } from '../model/record';
import type { SessionSummary } from '../model/session';
import { useSessions } from './useSessions';

const noSubscription = () => () => undefined;
const noVersion = () => -1;

export type SessionList =
  | { status: 'loading' }
  | {
      status: 'loaded';
      sessions: SessionSummary[];
      /** Stored sessions that cannot be read, shown so they can be deleted. */
      unreadable: UnreadableRecord[];
    }
  | { status: 'failed' };

/** Every recorded session, newest first, kept up to date as they change. */
export function useSessionList(): SessionList {
  const { store } = useSessions();
  const version = useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.getVersion ?? noVersion,
  );
  // Keeps showing the previous list while a newer one loads.
  const [list, setList] = useState<SessionList>({ status: 'loading' });

  useEffect(() => {
    if (!store) {
      return undefined;
    }

    let stale = false;

    Promise.all([store.list(), store.listUnreadable()]).then(
      ([sessions, unreadable]) => {
        if (!stale) {
          setList({ status: 'loaded', sessions, unreadable });
        }
      },
      () => {
        if (!stale) {
          setList({ status: 'failed' });
        }
      },
    );

    return () => {
      stale = true;
    };
  }, [store, version]);

  return list;
}
