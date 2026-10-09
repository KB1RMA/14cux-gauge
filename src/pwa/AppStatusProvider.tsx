// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, type ReactNode } from 'react';
import type { AppStatusStore } from './appStatusStore';
import { AppStatusContext } from './context';

/**
 * Provides the offline and update status from `store`, which runs its checks
 * while mounted if `checks` is set; without them it reports online and up
 * to date (see `createAppServices`).
 */
export function AppStatusProvider({
  store,
  checks,
  children,
}: {
  store: AppStatusStore;
  checks: boolean;
  children: ReactNode;
}) {
  useEffect(() => (checks ? store.start() : undefined), [checks, store]);

  return <AppStatusContext value={store}>{children}</AppStatusContext>;
}
