// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useCurrentPath } from './useCurrentPath';

/**
 * Navigates to a path unless the router's location already is that path. Radix Tabs
 * reports a tab again as it takes focus, before the router has re-rendered,
 * so a handler comparing against rendered state would push the same entry
 * twice and Back would seem to do nothing.
 */
export function useNavigateOnce(): (to: string) => void {
  const navigate = useNavigate();
  const currentRef = useCurrentPath();

  return useCallback(
    (to) => {
      if (currentRef.current !== to) {
        // Record it now: the router re-renders only after this handler, and
        // a second report of the same tab must find the new path.
        currentRef.current = to;
        void navigate(to);
      }
    },
    [navigate, currentRef],
  );
}
