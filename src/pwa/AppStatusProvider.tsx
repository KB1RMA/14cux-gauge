// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useState, type ReactNode } from 'react';
import { BUILD_INFO } from '../buildInfo';
import { AppStatusStore, type AppStatusStoreOptions } from './appStatusStore';
import { AppStatusContext } from './context';
import { defaultOptions } from './defaultOptions';

/**
 * Provides the offline and update status. `options` replaces the defaults,
 * which switch the checks on only in a production build (see
 * `defaultOptions`); without them the app reports online and up to date.
 */
export function AppStatusProvider({
  options,
  children,
}: {
  options?: AppStatusStoreOptions;
  children: ReactNode;
}) {
  const [config] = useState(() => options ?? defaultOptions());
  const [store] = useState(
    () => new AppStatusStore(config ?? { build: BUILD_INFO, versionUrl: '' }),
  );
  const enabled = config !== undefined;

  useEffect(() => (enabled ? store.start() : undefined), [enabled, store]);

  return <AppStatusContext value={store}>{children}</AppStatusContext>;
}
