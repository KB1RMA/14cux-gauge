// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import type { EcuLink, EcuSession } from '../ecu/session';
import type {
  FinishedOutcome,
  WriteId,
  WriteLogEntry,
  WriteOutcome,
} from '../model/write';
import {
  failureOutcome,
  notConnectedOutcome,
  performWrite,
  WRITE_HOLDER,
  type WriteRequest,
} from './writes';

/** A write that has started; it holds the link until `finish` is called. */
export interface WriteHandle {
  /** The connection the write was sent to. */
  readonly link: EcuLink;
  /** Ends the write and records how it went. Later calls do nothing. */
  finish(outcome: FinishedOutcome): void;
}

/**
 * The fuel pump test's write, which the view repeats until it ends it. The
 * view decides when to ask again and when to stop; this makes the call.
 */
export interface FuelPumpHandle extends WriteHandle {
  /** Whether the connection is still open. */
  isConnected(): boolean;
  /**
   * Asks the ECU to run the pump for about two seconds. Rejects if the call
   * failed.
   */
  renew(): Promise<void>;
}

/** What the views read: the writes on the current connection. */
export interface EcuWritesState {
  /** The write running on the current connection, if any. */
  running: WriteId | undefined;
  /** How each write last went on the current connection. */
  outcomes: Partial<Record<WriteId, WriteOutcome>>;
  /** The write that started or ended most recently. */
  latest: WriteId | undefined;
}

interface Writes {
  /** The connection these outcomes belong to. */
  link: EcuLink | undefined;
  outcomes: Partial<Record<WriteId, WriteOutcome>>;
  latest: WriteId | undefined;
}

const NONE: Writes = { link: undefined, outcomes: {}, latest: undefined };

/**
 * Every write to the ECU, and each one's outcome, which outlives the view
 * that started it. A write holds the session's link while it runs, so only
 * one write runs at a time, and none while a ROM read has the link. A write
 * belongs to the connection it was sent on: a new or lost connection starts
 * clean, and a write still finishing on an old one neither blocks nor reports
 * on the new one. Watchers, such as a recording or the notifications, are told
 * of every start and end.
 *
 * Plain TypeScript: React reads it through `useSyncExternalStore`, and tests
 * drive it without rendering.
 */
export class EcuWrites {
  private writes: Writes = NONE;
  /** The write running now, for watchers that start watching part-way. */
  private running: { link: EcuLink; entry: WriteLogEntry } | undefined;
  private readonly watchers = new Set<(entry: WriteLogEntry) => void>();
  private readonly listeners = new Set<() => void>();
  private cache:
    | { writes: Writes; link: EcuLink | undefined; state: EcuWritesState }
    | undefined;

  constructor(private readonly session: EcuSession) {}

  /** Calls `listener` when the writes on the current connection change. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    const stopSession = this.session.subscribe(listener);

    return () => {
      this.listeners.delete(listener);
      stopSession();
    };
  };

  readonly getSnapshot = (): EcuWritesState => {
    const { link } = this.session.getSnapshot();

    if (this.cache?.writes === this.writes && this.cache.link === link) {
      return this.cache.state;
    }

    const current = this.writes.link === link ? this.writes : NONE;
    const latestOutcome = current.latest && current.outcomes[current.latest];
    const state: EcuWritesState = {
      running: latestOutcome?.status === 'running' ? current.latest : undefined,
      outcomes: current.outcomes,
      latest: current.latest,
    };

    this.cache = { writes: this.writes, link, state };

    return state;
  };

  /**
   * Starts the fuel pump test's write, which the caller renews and ends
   * itself. Returns `undefined`, and starts nothing, if not connected or if
   * something else (another write, a ROM read) holds the link.
   */
  readonly beginFuelPump = (): FuelPumpHandle | undefined => {
    const started = this.start('fuelPump');

    return (
      started && {
        link: started.handle.link,
        finish: started.handle.finish,
        isConnected: () => started.ecu.isConnected(),
        renew: () => started.ecu.runFuelPump(),
      }
    );
  };

  /**
   * Starts a write that the caller ends itself. Returns `undefined`, and
   * starts nothing, if not connected or if something else holds the link.
   */
  readonly begin = (id: WriteId): WriteHandle | undefined =>
    this.start(id)?.handle;

  private start(id: WriteId): { handle: WriteHandle; ecu: Ecu } | undefined {
    // Taken at once, so two starts in one event cannot both get through.
    const lease = this.session.acquire(WRITE_HOLDER);

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
    let finished = false;

    this.running = token;
    this.setWrites({
      link: on,
      outcomes: {
        ...(this.writes.link === on ? this.writes.outcomes : {}),
        [id]: { status: 'running' },
      },
      latest: id,
    });
    this.tell(entry);

    const handle: WriteHandle = {
      link: on,
      finish: (outcome) => {
        if (finished) {
          return;
        }

        finished = true;
        lease.release();

        if (this.running === token) {
          this.running = undefined;
        }

        this.tell({ ...entry, endedAt: Date.now(), outcome });

        if (this.writes.link === on) {
          this.setWrites({
            link: on,
            outcomes: { ...this.writes.outcomes, [id]: outcome },
            latest: id,
          });
        }
      },
    };

    return { handle, ecu: lease.ecu };
  }

  /**
   * Runs a one-off write. Settles `true` if it succeeded, `false` if it
   * failed or could not start.
   */
  readonly run = async (request: WriteRequest): Promise<boolean> => {
    const { id } = request;
    const started = this.start(id);

    if (!started) {
      return false;
    }

    const { handle, ecu } = started;

    // A connection that is already closed sends nothing. One that closes
    // after this check may still have been written to, so it is partial.
    if (!ecu.isConnected()) {
      handle.finish(notConnectedOutcome(id));

      return false;
    }

    try {
      handle.finish({
        status: 'done',
        message: await performWrite(ecu, request),
      });

      return true;
    } catch (error) {
      handle.finish(failureOutcome(id, error));

      return false;
    }
  };

  /**
   * Calls `watcher` as each write starts and again as it ends, on any
   * connection, first with the write running on the current connection, if
   * there is one. Returns a function that stops watching.
   */
  readonly watch = (watcher: (entry: WriteLogEntry) => void): (() => void) => {
    const holder = this.running;

    if (holder && holder.link === this.session.getSnapshot().link) {
      watcher(holder.entry);
    }

    this.watchers.add(watcher);

    return () => {
      this.watchers.delete(watcher);
    };
  };

  private tell(entry: WriteLogEntry): void {
    for (const watcher of [...this.watchers]) {
      watcher(entry);
    }
  }

  private setWrites(next: Writes): void {
    this.writes = next;

    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
