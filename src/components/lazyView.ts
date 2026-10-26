// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  createElement,
  useEffect,
  useSyncExternalStore,
  type ComponentType,
} from 'react';

/** Why the view's code could not be loaded, as a value to tell apart. */
interface Failed {
  error: unknown;
}

/**
 * A view whose code is split out of the startup bundle, with `preload` to
 * fetch it early. Render it inside a `ViewBoundary`, which shows an error if
 * the code cannot be downloaded.
 *
 * Unlike `React.lazy` it never suspends. It says "Loading…" until its code
 * arrives, then re-renders with an ordinary update. A suspended view is
 * shown again only by React's retry, which runs at a priority that never
 * expires, so while live readings update the page many times a second the
 * retry can be put off indefinitely and leave "Loading…" on screen.
 *
 * Code that could not be downloaded stays failed until the page is
 * reloaded, as `ViewBoundary` says; an early `preload` that fails does not
 * count, so the view tries again when it is first shown.
 */
export function lazyView<P extends object>(
  load: () => Promise<ComponentType<P>>,
): { View: ComponentType<P>; preload(): Promise<ComponentType<P>> } {
  let loaded: ComponentType<P> | undefined;
  let failed: Failed | undefined;
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  // import() caches a module that loaded, so loading again is cheap.
  const preload = () =>
    load().then((component) => {
      if (!loaded) {
        loaded = component;
        notify();
      }

      return component;
    });

  const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  function View(props: P) {
    const state = useSyncExternalStore(subscribe, () => loaded ?? failed);

    useEffect(() => {
      if (state === undefined) {
        preload().catch((error: unknown) => {
          failed ??= { error };
          notify();
        });
      }
    }, [state]);

    if (state === undefined) {
      return createElement('p', null, 'Loading…');
    }

    if ('error' in state) {
      // For the ViewBoundary around it to show.
      throw state.error;
    }

    return createElement(state, props);
  }

  return { View, preload };
}
