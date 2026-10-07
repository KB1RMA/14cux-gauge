// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEcu } from '../ecu/useEcu';
import { useNotify } from '../notifications/useNotify';
import { EcuWriteContext, type WriteHandle } from './context';
import {
  failureOutcome,
  notConnectedOutcome,
  type WriteId,
  type WriteLogEntry,
  type WriteOutcome,
  writeNotification,
} from './writes';

interface Writes {
  /** The connection these outcomes belong to. */
  ecu: Ecu | undefined;
  outcomes: Partial<Record<WriteId, WriteOutcome>>;
  latest: WriteId | undefined;
}

const NONE: Writes = { ecu: undefined, outcomes: {}, latest: undefined };

/**
 * Tracks every write to the ECU, so only one runs at a time and each one's
 * outcome outlives the view that started it. A write belongs to the `Ecu` it
 * was sent to: a new or lost connection starts clean, and a write still
 * finishing on an old one neither blocks nor reports on the new one. Every
 * start and end is also a notification, which outlives the connection: the
 * user still needs to know how a write on a lost one ended. Watchers, such as
 * a recording, are told of every start and end too.
 */
export function EcuWriteProvider({ children }: { children: ReactNode }) {
  const { ecu } = useEcu();
  const notify = useNotify();
  const [writes, setWrites] = useState<Writes>(NONE);
  // Set synchronously, so two starts in one event cannot both get through.
  const holderRef = useRef<{ ecu: Ecu; entry: WriteLogEntry } | undefined>(
    undefined,
  );
  const watchersRef = useRef(new Set<(entry: WriteLogEntry) => void>());
  const current = writes.ecu === ecu ? writes : NONE;
  const latestOutcome = current.latest && current.outcomes[current.latest];
  const running =
    latestOutcome?.status === 'running' ? current.latest : undefined;

  const begin = useCallback(
    (id: WriteId): WriteHandle | undefined => {
      if (!ecu || holderRef.current?.ecu === ecu) {
        return undefined;
      }

      const entry: WriteLogEntry = {
        id: crypto.randomUUID(),
        write: id,
        startedAt: Date.now(),
        endedAt: null,
        outcome: { status: 'running' },
      };
      const token = { ecu, entry };

      const tell = (update: WriteLogEntry) => {
        for (const watcher of watchersRef.current) {
          watcher(update);
        }
      };

      let finished = false;

      holderRef.current = token;
      setWrites((previous) => ({
        ecu,
        outcomes: {
          ...(previous.ecu === ecu ? previous.outcomes : {}),
          [id]: { status: 'running' },
        },
        latest: id,
      }));
      notify(writeNotification(id, { status: 'running' }));
      tell(entry);

      return {
        ecu,
        finish(outcome) {
          if (finished) {
            return;
          }

          finished = true;

          if (holderRef.current === token) {
            holderRef.current = undefined;
          }

          notify(writeNotification(id, outcome));
          tell({ ...entry, endedAt: Date.now(), outcome });
          setWrites((previous) =>
            previous.ecu === ecu
              ? {
                  ecu,
                  outcomes: { ...previous.outcomes, [id]: outcome },
                  latest: id,
                }
              : previous,
          );
        },
      };
    },
    [ecu, notify],
  );

  const run = useCallback(
    async (id: WriteId, task: (ecu: Ecu) => Promise<string>) => {
      const handle = begin(id);

      if (!handle) {
        return false;
      }

      // A connection that is already closed sends nothing. One that closes
      // after this check may still have been written to, so it is partial.
      if (!handle.ecu.isConnected()) {
        handle.finish(notConnectedOutcome(id));

        return false;
      }

      try {
        handle.finish({ status: 'done', message: await task(handle.ecu) });

        return true;
      } catch (error) {
        handle.finish(failureOutcome(id, error));

        return false;
      }
    },
    [begin],
  );

  const watch = useCallback(
    (watcher: (entry: WriteLogEntry) => void) => {
      const holder = holderRef.current;

      if (holder && holder.ecu === ecu) {
        watcher(holder.entry);
      }

      watchersRef.current.add(watcher);

      return () => {
        watchersRef.current.delete(watcher);
      };
    },
    [ecu],
  );

  const value = useMemo(
    () => ({
      running,
      outcomes: current.outcomes,
      latest: current.latest,
      begin,
      run,
      watch,
    }),
    [running, current.outcomes, current.latest, begin, run, watch],
  );

  return <EcuWriteContext value={value}>{children}</EcuWriteContext>;
}
