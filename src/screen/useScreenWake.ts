// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useSyncExternalStore } from 'react';
import { usePreferences } from '../preferences/usePreferences';
import { usePlatform } from '../platform/usePlatform';
import { useServices } from '../services/useServices';
import type { ScreenWakeStatus } from './screenWake';

/** Whether the screen is being kept on, and if not, why. */
export function useScreenWake(): ScreenWakeStatus {
  const { screenWake } = useServices();

  return useSyncExternalStore(screenWake.subscribe, screenWake.getSnapshot)
    .status;
}

/** Whether this browser can keep the screen on at all. */
export function useCanKeepScreenOn(): boolean {
  return usePlatform().screen.wakeLock.available();
}

/**
 * Tells the screen-wake service what the "Keep the screen on" preference is.
 * Used once, by the app.
 */
export function useSyncKeepScreenOn(): void {
  const { screenWake } = useServices();
  const { keepScreenOn } = usePreferences();

  useEffect(() => {
    screenWake.setEnabled(keepScreenOn);
  }, [screenWake, keepScreenOn]);
}
