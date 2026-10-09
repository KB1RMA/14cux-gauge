// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EcuLink } from '../ecu/session';
import { useEcu } from '../ecu/useEcu';
import { useEcuSession } from '../ecu/useEcuSession';
import { useNotify } from '../notifications/useNotify';
import { EcuWriteContext, type WriteHandle } from './context';
import type { WriteId, WriteLogEntry, WriteOutcome } from '../model/write';
import {
  failureOutcome,
  notConnectedOutcome,
  performWrite,
  WRITE_HOLDER,
  writeNotification,
  type WriteRequest,
} from './writes';

interface Writes {
  /** The connection these outcomes belong to. */
  link: EcuLink | undefined;
  outcomes: Partial<Record<WriteId, WriteOutcome>>;
  latest: WriteId | undefined;
}

const NONE: Writes = { link: undefined, outcomes: {}, latest: undefined };

/**
 * Tracks every write to the ECU, and each one's outcome, which outlives the
 * view that started it. A write holds the ECU session's link while it runs,
 * so only one write runs at a time, and none while a ROM read has the link.
 * A write belongs to the connection it was sent on: a new or lost connection
 * starts clean, and a write still finishing on an old one neither blocks nor
 * reports on the new one. Every start and end is also a notification, which
 * outlives the connection: the user still needs to know how a write on a
 * lost one ended. Watchers, such as a recording, are told of every start and
 * end too.
 */
export function EcuWriteProvider({ children }: { children: ReactNode }) {
  const session = useEcuSession();
  const { link } = useEcu();
  const notify = useNotify();
  const [writes, setWrites] = useState<Writes>(NONE);
  // The write running now, for watchers that start watching part-way.
  const runningRef = useRef<
    { link: EcuLink; entry: WriteLogEntry } | undefined
  >(undefined);
  const watchersRef = useRef(new Set<(entry: WriteLogEntry) => void>());
  const current = writes.link === link ? writes : NONE;
  const latestOutcome = current.latest && current.outcomes[current.latest];
  const running =
    latestOutcome?.status === 'running' ? current.latest : undefined;

  const begin = useCallback(
    (id: WriteId): WriteHandle | undefined => {
      // Taken at once, so two starts in one event cannot both get through.
      const lease = session.acquire(WRITE_HOLDER);

      if (!lease) {
        return undefined;
      }

      const on = lease.link;
      const entry: WriteLogEntry = {
        id: crypto.randomUUID(),
        write: id,
        startedAt: Date.now(),
        endedAt: null,
        outcome: { status: 'running' },
      };
      const token = { link: on, entry };

      const tell = (update: WriteLogEntry) => {
        for (const watcher of watchersRef.current) {
          watcher(update);
        }
      };

      let finished = false;

      runningRef.current = token;
      setWrites((previous) => ({
        link: on,
        outcomes: {
          ...(previous.link === on ? previous.outcomes : {}),
          [id]: { status: 'running' },
        },
        latest: id,
      }));
      notify(writeNotification(id, { status: 'running' }));
      tell(entry);

      return {
        link: on,
        ecu: lease.ecu,
        finish(outcome) {
          if (finished) {
            return;
          }

          finished = true;
          lease.release();

          if (runningRef.current === token) {
            runningRef.current = undefined;
          }

          notify(writeNotification(id, outcome));
          tell({ ...entry, endedAt: Date.now(), outcome });
          setWrites((previous) =>
            previous.link === on
              ? {
                  link: on,
                  outcomes: { ...previous.outcomes, [id]: outcome },
                  latest: id,
                }
              : previous,
          );
        },
      };
    },
    [session, notify],
  );

  const run = useCallback(
    async (request: WriteRequest) => {
      const { id } = request;
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
        handle.finish({
          status: 'done',
          message: await performWrite(handle.ecu, request),
        });

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
      const holder = runningRef.current;

      if (holder && holder.link === session.getSnapshot().link) {
        watcher(holder.entry);
      }

      watchersRef.current.add(watcher);

      return () => {
        watchersRef.current.delete(watcher);
      };
    },
    [session],
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
