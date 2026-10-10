// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

/**
 * A ref holding the router's current path, for handlers that run later than
 * the render that created them (a promise settling, a control reporting a
 * change before the router has re-rendered). It is empty once the component
 * has unmounted. Read `.current` when the handler runs, not during render.
 */
export function useCurrentPath(): RefObject<string> {
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;

    return () => {
      // A handler that runs after the view has gone must not think it is
      // still where it was.
      pathRef.current = '';
    };
  }, [pathname]);

  return pathRef;
}
