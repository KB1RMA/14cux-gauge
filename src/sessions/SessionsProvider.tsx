// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useState, type ReactNode } from 'react';
import { ObservableSessionStore } from '../storage/observableSessionStore';
import { openSessionStore } from '../storage/openSessionStore';
import type { SessionStore } from '../storage/sessionStore';
import { SessionsContext, type SessionsValue } from './context';

export interface SessionsProviderProps {
  children: ReactNode;
  /** Opens the store; tests and the Electron app can supply their own. */
  open?: () => Promise<{ store: SessionStore; persistent: boolean }>;
}

const OPENING: SessionsValue = { store: undefined, persistent: false };

/** Opens the recorded-sessions store once, and closes it on unmount. */
export function SessionsProvider({
  children,
  open = openSessionStore,
}: SessionsProviderProps) {
  const [value, setValue] = useState<SessionsValue>(OPENING);

  useEffect(() => {
    let store: SessionStore | undefined;
    let unmounted = false;

    void open().then((opened) => {
      store = opened.store;

      if (unmounted) {
        store.close();

        return;
      }

      setValue({
        store: new ObservableSessionStore(opened.store),
        persistent: opened.persistent,
      });
    });

    return () => {
      unmounted = true;
      store?.close();
    };
  }, [open]);

  return <SessionsContext value={value}>{children}</SessionsContext>;
}
