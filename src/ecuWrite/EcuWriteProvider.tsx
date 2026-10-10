// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useNotify } from '../notifications/useNotify';
import { useServices } from '../services/useServices';
import { EcuWriteContext } from './context';
import { writeNotification } from './writes';

/**
 * Exposes `EcuWrites` to the views, and shows every write's start and end as
 * a notification, which outlives the connection: the user still needs to
 * know how a write on a lost one ended.
 */
export function EcuWriteProvider({ children }: { children: ReactNode }) {
  const { writes } = useServices();
  const notify = useNotify();
  const state = useSyncExternalStore(writes.subscribe, writes.getSnapshot);

  useEffect(
    () =>
      writes.watch(({ write, outcome }) => {
        notify(writeNotification(write, outcome));
      }),
    [writes, notify],
  );

  const value = useMemo(
    () => ({ ...state, beginFuelPump: writes.beginFuelPump, run: writes.run }),
    [state, writes],
  );

  return <EcuWriteContext value={value}>{children}</EcuWriteContext>;
}
