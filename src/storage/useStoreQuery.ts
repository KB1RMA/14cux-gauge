// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useEffect, useRef, useState } from 'react';

export type StoreQuery<T> =
  { status: 'loading' } | { status: 'loaded'; value: T } | { status: 'failed' };

interface Observable {
  subscribe(listener: () => void): () => void;
}

const LOADING = { status: 'loading' } as const;

/**
 * What `read` gives for `store`, read again whenever the store reports a
 * change. While a newer result loads, the previous one is kept, so a list
 * does not blank out each time it changes. `read` must keep its identity
 * (define it outside the component); `store` is `undefined` while storage
 * is being opened.
 *
 * Also returns `settled`, which resolves once the result reflects every
 * change the store has reported so far. Await it after changing the store,
 * so that whatever happens next sees the change.
 */
export function useStoreQuery<S extends Observable, T>(
  store: S | undefined,
  read: (store: S) => Promise<T>,
): [StoreQuery<T>, settled: () => Promise<void>] {
  const [result, setResult] = useState<{
    store: S | undefined;
    query: StoreQuery<T>;
  }>({ store, query: LOADING });
  // The newest read, settling once its result is shown (or dropped).
  const latestRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!store) {
      return undefined;
    }

    let latest = 0;
    let stopped = false;

    const load = () => {
      const ticket = ++latest;
      // Only the newest read counts; an older one may settle after it.
      const current = () => !stopped && ticket === latest;

      latestRef.current = read(store).then(
        (value) => {
          if (current()) {
            setResult({ store, query: { status: 'loaded', value } });
          }
        },
        () => {
          if (current()) {
            setResult({ store, query: { status: 'failed' } });
          }
        },
      );
    };

    const unsubscribe = store.subscribe(load);

    load();

    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [store, read]);

  const settled = useCallback(async () => {
    let awaited: Promise<void>;

    // A change reported meanwhile starts a newer read; wait for that too.
    do {
      awaited = latestRef.current;
      await awaited;
    } while (awaited !== latestRef.current);
  }, []);

  return [result.store === store ? result.query : LOADING, settled];
}
