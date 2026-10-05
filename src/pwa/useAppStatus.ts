// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use, useSyncExternalStore } from 'react';
import type { AppStatus } from './appStatusStore';
import { AppStatusContext } from './context';

export interface AppStatusValue extends AppStatus {
  /** Reloads into the newer build; see `AppStatusStore.applyUpdate`. */
  applyUpdate(): void;
}

export function useAppStatus(): AppStatusValue {
  const store = use(AppStatusContext);

  if (!store) {
    throw new Error('useAppStatus must be used inside <AppStatusProvider>');
  }

  const status = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return {
    ...status,
    applyUpdate: () => {
      store.applyUpdate();
    },
  };
}
