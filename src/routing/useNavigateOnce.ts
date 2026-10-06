// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/**
 * Navigates to a path unless the address already is that path. Radix Tabs
 * reports a tab again as it takes focus, before the router has re-rendered,
 * so a handler comparing against rendered state would push the same entry
 * twice and Back would seem to do nothing.
 */
export function useNavigateOnce(): (to: string) => void {
  const navigate = useNavigate();

  return useCallback(
    (to) => {
      if (window.location.hash !== `#${to}`) {
        void navigate(to);
      }
    },
    [navigate],
  );
}
