// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useSyncExternalStore } from 'react';
import { useServices } from './useServices';

/**
 * The open storage, or `undefined` while it is being opened, or once it has
 * closed or failed (see `useStorageStatus`). For `SessionsProvider` only:
 * views use `useSessions` and `useRoms`, which never hand out the stores
 * themselves.
 */
export function useStorage() {
  const { storage } = useServices();

  return useSyncExternalStore(storage.subscribe, storage.getSnapshot);
}

/** Where the storage stands: opening, open, closed or failed. */
export function useStorageStatus() {
  const { storage } = useServices();

  return useSyncExternalStore(storage.subscribe, storage.getStatus);
}
