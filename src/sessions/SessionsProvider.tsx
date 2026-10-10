// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useMemo, type ReactNode } from 'react';
import type { SessionStore } from '../storage/sessionStore';
import { useStorage, useStorageStatus } from '../storage/useStorage';
import { useStoreQuery } from '../storage/useStoreQuery';
import { SessionsContext, type SessionsValue } from './context';

async function readList(store: SessionStore) {
  const [sessions, unreadable] = await Promise.all([
    store.list(),
    store.listUnreadable(),
  ]);

  return { sessions, unreadable };
}

function notOpen(): Promise<never> {
  return Promise.reject(new Error('Storage is still being opened.'));
}

/** The recorded sessions, for views to list, read, rename and delete. */
export function SessionsProvider({ children }: { children: ReactNode }) {
  const storage = useStorage();
  const { status } = useStorageStatus();
  const store = storage?.sessions;
  const [query, settled] = useStoreQuery(store, readList);

  // Kept apart from the list, so reading a session's samples does not
  // start again each time the list changes.
  const actions = useMemo<Pick<SessionsValue, 'edit' | 'remove' | 'read'>>(
    () => ({
      // Each resolves once the list shows the change, so a view acting on
      // it next (moving focus, say) sees the list as it now is.
      edit: async (id, changes) => {
        await (store ? store.update(id, changes) : notOpen());
        await settled();
      },
      remove: async (id) => {
        await (store ? store.remove(id) : notOpen());
        await settled();
      },
      read: async (id) => {
        if (!store) {
          return notOpen();
        }

        const [samples, writes] = await Promise.all([
          store.readSamples(id),
          store.readWrites(id),
        ]);

        return { samples, writes };
      },
    }),
    [store, settled],
  );
  const persistent = storage?.persistent;
  const opened = storage !== undefined;
  const unavailable =
    status === 'closed' || status === 'failed' ? status : undefined;
  const value = useMemo<SessionsValue>(
    () => ({
      list:
        query.status === 'loaded'
          ? { status: 'loaded', ...query.value }
          : query,
      persistent,
      opened,
      unavailable,
      ...actions,
    }),
    [query, persistent, opened, unavailable, actions],
  );

  return <SessionsContext value={value}>{children}</SessionsContext>;
}
