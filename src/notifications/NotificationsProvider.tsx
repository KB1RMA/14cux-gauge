// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Notifications } from '../components/Notifications';
import {
  NotificationsContext,
  type Notification,
  type NotificationInput,
} from './context';

/**
 * Holds the app's notifications and shows them in one place at the bottom of
 * the window, whichever view is open.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<readonly Notification[]>([]);
  const nextIdRef = useRef(1);

  const notify = useCallback((input: NotificationInput) => {
    const id = nextIdRef.current;

    nextIdRef.current += 1;
    // Closes the one this replaces, so it animates away, and forgets those
    // that closed before.
    setList((previous) => [
      ...previous
        .filter(({ open }) => open)
        .map((item) =>
          item.key === input.key ? { ...item, open: false } : item,
        ),
      { ...input, id, open: true },
    ]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setList((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, open: false } : item,
      ),
    );
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationsContext value={value}>
      <Notifications list={list} onDismiss={dismiss}>
        {children}
      </Notifications>
    </NotificationsContext>
  );
}
