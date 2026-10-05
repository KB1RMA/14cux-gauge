// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot } from '../ecu/poller';
import type {
  NewSession,
  SessionStore,
  SessionSummary,
} from '../storage/sessionStore';

export interface RecorderOptions {
  /** Write buffered samples at least this often, in milliseconds. */
  flushIntervalMs?: number;
  /** Write as soon as this many samples are buffered. */
  maxBuffered?: number;
  /** Called once if a write fails; recording stops accepting samples. */
  onError?(error: unknown): void;
}

/**
 * Records live snapshots into a {@link SessionStore}. Samples are buffered
 * and written in batches, so a fast poll costs one write a second rather
 * than one per sample, and writes are queued so they land in order.
 */
export class SessionRecorder {
  private buffer: LiveSnapshot[] = [];
  private writes: Promise<void> = Promise.resolve();
  private failed = false;
  private stopped = false;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly maxBuffered: number;

  private constructor(
    private readonly store: SessionStore,
    readonly session: SessionSummary,
    private readonly options: RecorderOptions,
  ) {
    this.maxBuffered = options.maxBuffered ?? 200;
    this.timer = setInterval(() => {
      void this.flush();
    }, options.flushIntervalMs ?? 1000);
  }

  static async start(
    store: SessionStore,
    session: NewSession,
    options: RecorderOptions = {},
  ): Promise<SessionRecorder> {
    return new SessionRecorder(store, await store.create(session), options);
  }

  get recording(): boolean {
    return !this.stopped && !this.failed;
  }

  push(snapshot: LiveSnapshot): void {
    if (!this.recording) {
      return;
    }

    this.buffer.push(snapshot);

    if (this.buffer.length >= this.maxBuffered) {
      void this.flush();
    }
  }

  /** Writes any buffered samples. Resolves once every queued write is done. */
  flush(): Promise<void> {
    if (this.buffer.length > 0 && !this.failed) {
      const batch = this.buffer;

      this.buffer = [];
      this.writes = this.writes.then(async () => {
        if (this.failed) {
          return;
        }

        try {
          await this.store.append(this.session.id, batch);
        } catch (error) {
          this.failed = true;
          this.options.onError?.(error);
        }
      });
    }

    return this.writes;
  }

  /** Writes what is left and marks the session finished. */
  async stop(endedAt = Date.now()): Promise<SessionSummary> {
    clearInterval(this.timer);
    this.stopped = true;
    await this.flush();

    return this.store.finish(this.session.id, endedAt);
  }
}
