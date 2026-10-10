// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { recordedSource } from '../ecu/connect';
import type { EcuSession } from '../ecu/session';
import type { EcuWrites } from '../ecuWrite/ecuWrites';
import type { SessionSummary } from '../model/session';
import { defaultSessionName, describeStorageError } from '../sessions/format';
import type { StorageService } from '../storage/storageService';
import { SessionRecorder } from './sessionRecorder';

export interface RecorderState {
  /** The session being recorded, or `undefined` when not recording. */
  active: SessionSummary | undefined;
  /** Whether {@link Recorder.start} would record: connected, storage open. */
  canRecord: boolean;
  /** Why the last recording stopped by itself, if a write failed. */
  error: string | undefined;
  /**
   * A recording the user has just stopped, to offer a name and notes for;
   * cleared by {@link Recorder.dismissFinished}. Recordings that stop by
   * themselves (the link dropped, a write failed) keep their default name.
   */
  finished: SessionSummary | undefined;
}

interface Active {
  recorder: SessionRecorder;
  unsubscribe(): void;
}

/**
 * Records the live snapshots, and the writes to the ECU, into a session
 * while the user asks it to. Recording stops by itself when the connection
 * ends, keeping what was recorded, or if saving fails. Something that needs
 * the link to itself (a ROM read) calls {@link Recorder.interrupt}.
 */
export class Recorder {
  private state: RecorderState;
  private current: Active | undefined;
  /** Settles once a start in progress has finished, successfully or not. */
  private starting: Promise<void> | undefined;
  private readonly stopFollowing: () => void;
  private unwatchConnection: (() => void) | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly session: EcuSession,
    private readonly writes: EcuWrites,
    private readonly storage: StorageService,
  ) {
    this.state = {
      active: undefined,
      canRecord: false,
      error: undefined,
      finished: undefined,
    };

    const stops = [
      session.subscribe(this.refreshCanRecord),
      storage.subscribe(this.refreshCanRecord),
    ];

    this.stopFollowing = () => {
      for (const stop of stops) {
        stop();
      }
    };

    this.refreshCanRecord();
  }

  /** Calls `listener` when the recording, or whether one can start, changes. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): RecorderState => this.state;

  /** Follows the connection and the storage, which decide `canRecord`. */
  private readonly refreshCanRecord = (): void => {
    this.set({
      canRecord: this.connected() && this.storage.getSnapshot() !== undefined,
    });
  };

  /** Starts recording every snapshot into a new session. */
  readonly start = (): Promise<void> => {
    if (this.starting) {
      return this.starting;
    }

    const starting = this.begin().finally(() => {
      if (this.starting === starting) {
        this.starting = undefined;
      }
    });

    this.starting = starting;

    return starting;
  };

  private async begin(): Promise<void> {
    const store = this.storage.getSnapshot()?.sessions;
    const { connection } = this.session.getSnapshot();

    if (!store || connection.status !== 'connected' || this.current) {
      return;
    }

    const source = recordedSource(connection.source);

    this.set({ error: undefined });

    try {
      const startedAt = Date.now();
      const recorder = await SessionRecorder.start(
        store,
        { name: defaultSessionName(source, startedAt), source, startedAt },
        {
          onError: (cause) => {
            this.set({ error: describeStorageError(cause) });
            this.stopQuietly();
          },
        },
      );

      const stopSamples = this.session.onSnapshot((snapshot) => {
        recorder.push(snapshot);
      });
      const stopWrites = this.writes.watch((entry) => {
        recorder.recordWrite(entry);
      });

      this.current = {
        recorder,
        unsubscribe: () => {
          stopSamples();
          stopWrites();
        },
      };
      this.set({ active: recorder.session });
    } catch (cause) {
      this.set({ error: describeStorageError(cause) });
    }

    // Keep what was recorded when the connection ends, including when it
    // ended while recording was starting.
    if (this.current) {
      if (this.connected()) {
        this.unwatchConnection = this.session.subscribe(() => {
          if (!this.connected()) {
            this.stopQuietly();
          }
        });
      } else {
        this.stopQuietly();
      }
    }
  }

  /** Stops recording and sets `finished`. */
  readonly stop = async (): Promise<void> => {
    // A start still opening the session is allowed to finish, so that this
    // stops it rather than leaving it to start afterwards.
    await this.starting;

    try {
      this.set({ finished: await this.finish() });
    } catch (cause) {
      this.set({ error: describeStorageError(cause) });
    }
  };

  /**
   * Stops recording because something else needs the link (see
   * `ROM_READ_HOLDER`). What was recorded is kept under its default name,
   * with no prompt to rename it.
   */
  readonly interrupt = async (): Promise<void> => {
    await this.starting;

    try {
      await this.finish();
    } catch (cause) {
      this.set({ error: describeStorageError(cause) });
    }
  };

  readonly dismissFinished = (): void => {
    this.set({ finished: undefined });
  };

  /**
   * Keeps what has been recorded, as when the app goes. Settles once the
   * session is saved and finished, so the storage can be closed after it.
   */
  async dispose(): Promise<void> {
    this.stopFollowing();
    this.listeners.clear();
    await this.starting;
    await this.finish().catch(() => undefined);
  }

  private connected(): boolean {
    return this.session.getSnapshot().connection.status === 'connected';
  }

  /** Stops recording; resolves with the finished session, if there was one. */
  private async finish(): Promise<SessionSummary | undefined> {
    const current = this.current;

    if (!current) {
      return undefined;
    }

    this.current = undefined;
    this.unwatchConnection?.();
    this.unwatchConnection = undefined;
    current.unsubscribe();
    this.set({ active: undefined });

    return current.recorder.stop();
  }

  // Stopping by itself, the recording keeps what it has; a failure here has
  // already been reported through the recorder's onError.
  private stopQuietly(): void {
    void this.finish().catch(() => undefined);
  }

  private set(change: Partial<RecorderState>): void {
    const next = { ...this.state, ...change };

    if (
      next.active === this.state.active &&
      next.error === this.state.error &&
      next.finished === this.state.finished &&
      next.canRecord === this.state.canRecord
    ) {
      return;
    }

    this.state = next;

    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
