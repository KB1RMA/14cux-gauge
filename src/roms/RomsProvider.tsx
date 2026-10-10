// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useServices } from '../services/useServices';
import { RomsContext, type RomsValue } from './context';

/**
 * Exposes `RomReader` to the views. The read belongs to the controller, so
 * it carries on if the user changes view.
 */
export function RomsProvider({ children }: { children: ReactNode }) {
  const { roms } = useServices();
  const state = useSyncExternalStore(roms.subscribe, roms.getSnapshot);

  const value = useMemo<RomsValue>(
    () => ({
      ...state,
      read: roms.read,
      cancel: roms.cancel,
      dismissOutcome: roms.dismissOutcome,
      download: roms.download,
      remove: roms.remove,
    }),
    [state, roms],
  );

  return <RomsContext value={value}>{children}</RomsContext>;
}
