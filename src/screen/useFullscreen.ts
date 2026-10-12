// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useState, useSyncExternalStore } from 'react';
import { usePlatform } from '../platform/usePlatform';

export interface FullscreenControl {
  /** Whether the browser can show the app full screen at all. */
  available: boolean;
  active: boolean;
  /** Why the last attempt failed, until the next one. */
  error: string | undefined;
  toggle(): Promise<void>;
}

/** Whether the app is full screen, and a way to change it. */
export function useFullscreen(): FullscreenControl {
  const { fullscreen } = usePlatform().screen;
  const active = useSyncExternalStore(
    useCallback((listener) => fullscreen.watch(listener), [fullscreen]),
    () => fullscreen.active(),
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const toggle = useCallback(async () => {
    setError(undefined);

    try {
      await (fullscreen.active() ? fullscreen.exit() : fullscreen.enter());
    } catch {
      setError('The browser would not go full screen.');
    }
  }, [fullscreen]);

  return { available: fullscreen.available(), active, error, toggle };
}
