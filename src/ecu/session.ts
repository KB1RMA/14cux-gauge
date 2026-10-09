// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import {
  DiagnosticLog,
  consoleMirror,
  describeRawError,
} from '../diagnostics/diagnosticLog';
import { pushSnapshot } from '../history/pushSnapshot';
import { SampleHistory } from '../history/sampleHistory';
import { METRIC_KEYS, type MetricKey } from '../metrics';
import type { LiveSnapshot, ReadingKey } from '../model/snapshot';
import {
  createEcuConnection,
  type EcuConnection,
  type EcuSource,
} from './connect';
import { connectionReducer, type ConnectionState } from './connectionState';
import { describeError, errorReason } from './errors';
import {
  ALL_READINGS,
  pickReadings,
  startPoller,
  type Poller,
  type PollerStats,
} from './poller';

/**
 * Samples kept for the graphs' session window: about 21 MB once full (25
 * readings and a time, 8 bytes each), which is 66 minutes at 25 samples a
 * second or 5 hours at a typical 5.5. The history only grows this big as a
 * session runs on.
 */
export const HISTORY_CAPACITY = 100_000;

/**
 * One connection to an ECU, from when it is made until it ends. A new
 * connection is a new link, so work started on one (a read, a write) can
 * tell that it has ended. Compare links by identity.
 */
export interface EcuLink {
  readonly id: number;
}

/**
 * What is using the link, beside polling, and what it needs while it does.
 * Only one holder has the link at a time.
 */
export interface LinkHolder {
  kind: 'write' | 'romRead';
  /**
   * Polling stops while the holder has the link, and the live readings are
   * cleared, so no old value looks current.
   */
  pausesPolling: boolean;
  /**
   * Any recording ends before the holder starts. A recording would
   * otherwise have a gap while polling is paused, which replay could draw
   * across.
   */
  stopsRecording: boolean;
}

/** The link, held by one holder until it is released. */
export interface Lease {
  readonly link: EcuLink;
  readonly ecu: Ecu;
  /**
   * Settles once the holder's policy has been applied: any recording
   * stopped, polling paused.
   */
  readonly ready: Promise<void>;
  /**
   * Gives the link back, and carries on polling if it was paused. Later
   * calls do nothing, and so does a call after the connection has ended.
   */
  release(): void;
}

export interface LiveData {
  snapshot: LiveSnapshot | undefined;
  stats: PollerStats;
}

export interface EcuSessionState {
  connection: ConnectionState;
  /** The connected link; `undefined` unless connected. */
  link: EcuLink | undefined;
  /** What holds the link on the current connection, if anything. */
  holder: LinkHolder | undefined;
  /** Whether live polling is paused so a holder has the link to itself. */
  pollingPaused: boolean;
}

/** What the poller reads, asked before every pass. */
export interface ReadingSelection {
  /** Every reading to take. */
  polled: ReadonlySet<ReadingKey>;
  /** Those the user chose, which are what a recording keeps. */
  chosen: ReadonlySet<ReadingKey>;
  /** Those that decide whether slow values can wait (see the poller). */
  watched: ReadonlySet<ReadingKey>;
}

export interface EcuSessionOptions {
  /** Pause between polling passes for each connection kind, in milliseconds. */
  pollIntervalMs?: Partial<Record<EcuSource['kind'], number>> | undefined;
  /** Where serial traffic and connection events are recorded. */
  diagnostics?: DiagnosticLog | undefined;
  /** Makes the connection for a source; defaults to Web Serial or the demo. */
  createConnection?: (source: EcuSource, log: DiagnosticLog) => EcuConnection;
}

const NO_LIVE_DATA: LiveData = {
  snapshot: undefined,
  stats: { sampleRateHz: 0 },
};

const EVERY_READING: ReadingSelection = {
  polled: ALL_READINGS,
  chosen: ALL_READINGS,
  watched: ALL_READINGS,
};

function createDefaultLog(): DiagnosticLog {
  // Echo connection events (not bytes) to the console, except in unit tests.
  return new DiagnosticLog(
    import.meta.env.MODE === 'test' ? {} : { mirror: consoleMirror },
  );
}

interface Active {
  link: EcuLink;
  connection: EcuConnection;
  poller?: Poller;
  unwatch?: () => void;
}

/**
 * The connection to the ECU and everything that shares it: the connection's
 * lifecycle, the poller, the live readings and their history, and whoever
 * else holds the link (a write, a ROM read). Plain TypeScript, so React reads
 * it through `useSyncExternalStore` and tests drive it without rendering.
 *
 * The connection state and the live readings are two stores, so that views
 * that only care whether the ECU is connected do not change with every
 * sample.
 */
export class EcuSession {
  readonly log: DiagnosticLog;
  /** Recent samples of every metric, for the graphs; cleared on each connect. */
  readonly history = new SampleHistory<MetricKey>(
    METRIC_KEYS,
    HISTORY_CAPACITY,
  );

  private state: EcuSessionState = {
    connection: { status: 'idle' },
    link: undefined,
    holder: undefined,
    pollingPaused: false,
  };

  private live: LiveData = NO_LIVE_DATA;
  private readonly listeners = new Set<() => void>();
  private readonly liveListeners = new Set<() => void>();
  private readonly snapshotListeners = new Set<
    (snapshot: LiveSnapshot) => void
  >();

  private selection: ReadingSelection = EVERY_READING;
  private active: Active | undefined;
  /** Identifies the lease held on the active connection, if any. */
  private lease: object | undefined;
  private stopRecording: (() => Promise<void>) | undefined;
  private links = 0;
  // Bumped by every connect/disconnect, so a slow async step can tell that it
  // has been superseded.
  private generation = 0;
  // Settles once every connection torn down so far has been disposed, so a
  // new connection never opens the port while the last one still holds it.
  private disposed: Promise<void> = Promise.resolve();

  constructor(private readonly options: EcuSessionOptions = {}) {
    this.log = options.diagnostics ?? createDefaultLog();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): EcuSessionState => this.state;

  /** Like `subscribe`, for the live readings, which change with every pass. */
  readonly subscribeLive = (listener: () => void): (() => void) => {
    this.liveListeners.add(listener);

    return () => {
      this.liveListeners.delete(listener);
    };
  };

  /** The latest snapshot from the poller, and its measured sample rate. */
  readonly getLive = (): LiveData => this.live;

  /**
   * Calls `listener` with every snapshot the poller takes, from any
   * connection, until the returned function is called. Each holds only the
   * chosen readings, not those a view asked for.
   */
  readonly onSnapshot = (
    listener: (snapshot: LiveSnapshot) => void,
  ): (() => void) => {
    this.snapshotListeners.add(listener);

    return () => {
      this.snapshotListeners.delete(listener);
    };
  };

  /** What to read from the next pass on. */
  readonly select = (selection: ReadingSelection): void => {
    this.selection = selection;
  };

  /**
   * Sets how a holder that `stopsRecording` stops the recording; returns a
   * function that removes it.
   */
  readonly setRecordingStopper = (stop: () => Promise<void>): (() => void) => {
    this.stopRecording = stop;

    return () => {
      if (this.stopRecording === stop) {
        this.stopRecording = undefined;
      }
    };
  };

  /** The ECU on `link`, while that link is the one connected. */
  readonly ecuFor = (link: EcuLink): Ecu | undefined =>
    this.state.link === link && this.active?.link === link
      ? this.active.connection.ecu
      : undefined;

  readonly connect = async (source: EcuSource): Promise<void> => {
    const myGeneration = ++this.generation;

    await this.teardown();

    // Another connect or a disconnect came while the last one was closing.
    if (myGeneration !== this.generation) {
      return;
    }

    this.history.clear();
    this.dispatchConnection({ type: 'connect', source });
    this.log.record(
      'event',
      source.kind === 'demo'
        ? 'Connecting to the demo ECU'
        : `Connecting to a serial ECU${source.doubleSpeed ? ' (double-speed firmware)' : ''}`,
    );

    const connection = (this.options.createConnection ?? createEcuConnection)(
      source,
      this.log,
    );
    const active: Active = { link: { id: ++this.links }, connection };

    this.active = active;

    try {
      await connection.ecu.connect();
    } catch (error) {
      await this.fail(myGeneration, error);

      return;
    }

    if (myGeneration !== this.generation) {
      return;
    }

    active.unwatch = connection.onLost(() => {
      this.log.record('event', 'The browser reported the port disconnected');
      void this.fail(
        myGeneration,
        new DOMException('The serial port was disconnected.', 'NetworkError'),
      );
    });
    active.poller = startPoller(connection.ecu, {
      intervalMs: this.options.pollIntervalMs?.[source.kind] ?? 0,
      readings: () => this.selection.polled,
      watched: () => this.selection.watched,
      onSnapshot: (snapshot, stats) => {
        pushSnapshot(this.history, snapshot);

        if (this.snapshotListeners.size > 0) {
          const chosenOnly = pickReadings(snapshot, this.selection.chosen);

          for (const listener of this.snapshotListeners) {
            listener(chosenOnly);
          }
        }

        this.setLive({ snapshot, stats });
      },
      onError: (error) => {
        void this.fail(myGeneration, error);
      },
      onRetry: (error, consecutiveErrors) => {
        this.log.record(
          'error',
          `Polling pass failed (${String(consecutiveErrors)} in a row), retrying: ${describeRawError(error)}`,
        );
      },
    });
    this.update({
      connection: connectionReducer(this.state.connection, {
        type: 'connected',
      }),
      link: active.link,
    });
    this.log.record('event', 'Connected; polling live data');
  };

  readonly disconnect = async (): Promise<void> => {
    const myGeneration = ++this.generation;

    this.log.record('event', 'Disconnecting at the user’s request');
    await this.teardown();

    // A connection started while this one was closing takes precedence.
    if (myGeneration === this.generation) {
      this.dispatchConnection({ type: 'disconnected' });
    }
  };

  /** Connects again to the last source (same serial port, or demo). */
  readonly reconnect = async (): Promise<void> => {
    const { connection } = this.state;

    if (connection.status !== 'idle') {
      await this.connect(connection.source);
    }
  };

  /** Closes any connection without reporting it, as the app does on unload. */
  readonly dispose = (): void => {
    this.generation++;
    void this.teardown();
  };

  /**
   * Takes the link for `holder`, or returns `undefined` if not connected or
   * if something else holds it. The link is taken at once, so two holders
   * can never both have it; wait for `ready` before using it.
   */
  readonly acquire = (holder: LinkHolder): Lease | undefined => {
    const active = this.active;

    if (!active || this.state.link !== active.link || this.lease) {
      return undefined;
    }

    const held = { released: false, resume: () => undefined as void };
    // Set by `release`, which may run before `ready` settles.
    const released = () => held.released;

    this.lease = held;
    this.update({ holder });

    const ready = (async () => {
      if (holder.stopsRecording) {
        await this.stopRecording?.();
      }

      if (holder.pausesPolling && !released() && this.active === active) {
        const resume = await this.pausePolling(active);

        if (released()) {
          resume();
        } else {
          held.resume = resume;
        }
      }
    })();

    return {
      link: active.link,
      ecu: active.connection.ecu,
      ready,
      release: () => {
        if (held.released) {
          return;
        }

        held.released = true;

        if (this.lease === held) {
          this.lease = undefined;
          this.update({ holder: undefined });
        }

        held.resume();
      },
    };
  };

  /**
   * Pauses live polling on `active` and settles once the link is free.
   * Returns the function that carries on, which does nothing if the
   * connection has ended meanwhile.
   */
  private async pausePolling(active: Active): Promise<() => void> {
    const poller = active.poller;

    if (!poller) {
      return () => undefined;
    }

    this.update({ pollingPaused: true });
    await poller.pause();

    if (this.active !== active) {
      return () => undefined;
    }

    // The pass that was finishing may have published a snapshot.
    this.setLive(NO_LIVE_DATA);
    // An invalid sample marks the pause in the history, so graphs break the
    // line there rather than join the readings either side of it.
    pushSnapshot(this.history, { timestamp: Date.now() });

    return () => {
      if (this.active === active) {
        this.update({ pollingPaused: false });
        poller.resume();
      }
    };
  }

  private async teardown(): Promise<void> {
    const current = this.active;

    this.active = undefined;
    this.lease = undefined;
    this.update({ link: undefined, holder: undefined, pollingPaused: false });
    this.setLive(NO_LIVE_DATA);

    if (current) {
      current.unwatch?.();
      current.poller?.stop();
      // A failed dispose has nothing to recover, and must not block the
      // next connection.
      this.disposed = this.disposed
        .then(() => current.connection.dispose())
        .catch(() => undefined);
    }

    await this.disposed;
  }

  private async fail(forGeneration: number, error: unknown): Promise<void> {
    if (forGeneration !== this.generation) {
      return;
    }

    const detail = describeRawError(error);

    this.log.record('error', `Connection failed: ${detail}`);
    await this.teardown();

    // A connection started while this one was closing takes precedence.
    if (forGeneration !== this.generation) {
      return;
    }

    this.dispatchConnection({
      type: 'failed',
      message: describeError(error),
      detail,
      reason: errorReason(error),
    });
  }

  private dispatchConnection(
    action: Parameters<typeof connectionReducer>[1],
  ): void {
    this.update({
      connection: connectionReducer(this.state.connection, action),
    });
  }

  private update(change: Partial<EcuSessionState>): void {
    const next = { ...this.state, ...change };

    if (
      next.connection === this.state.connection &&
      next.link === this.state.link &&
      next.holder === this.state.holder &&
      next.pollingPaused === this.state.pollingPaused
    ) {
      return;
    }

    this.state = next;

    for (const listener of this.listeners) {
      listener();
    }
  }

  private setLive(live: LiveData): void {
    if (live === this.live) {
      return;
    }

    this.live = live;

    for (const listener of this.liveListeners) {
      listener();
    }
  }
}
