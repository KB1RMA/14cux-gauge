// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useMemo, useSyncExternalStore } from 'react';
import type { EcuContextValue } from './contexts';
import { useEcuSession } from './useEcuSession';

/** The connection, and ways to change it. Does not change with each sample. */
export function useEcu(): EcuContextValue {
  const session = useEcuSession();
  const { connection, link, holder, pollingPaused } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );

  return useMemo(
    () => ({
      state: connection,
      link,
      holder,
      pollingPaused,
      connect: session.connect,
      disconnect: session.disconnect,
      reconnect: session.reconnect,
      onSnapshot: session.onSnapshot,
    }),
    [connection, link, holder, pollingPaused, session],
  );
}
