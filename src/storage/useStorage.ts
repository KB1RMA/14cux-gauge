// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use, useSyncExternalStore } from 'react';
import { StorageContext } from './context';
import type { AppStorage } from './openStorage';
import type { StorageStatus } from './storageController';

/** Where the storage stands: opening, open, closed or failed. */
export function useStorageStatus(): StorageStatus {
  const controller = use(StorageContext);

  if (!controller) {
    throw new Error('Storage hooks must be used inside <StorageProvider>');
  }

  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

/**
 * The open storage, or `undefined` while it is being opened, or once it has
 * closed or failed (see `useStorageStatus`). For the sessions, recording and
 * ROM providers only: views use `useSessions` and `useRoms`, which never hand
 * out the stores themselves.
 */
export function useStorage(): AppStorage | undefined {
  const status = useStorageStatus();

  return status.status === 'open' ? status.storage : undefined;
}
