// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { EcuSession } from '../ecu/session';
import type { WakeLockHold, WakeLockPlatform } from '../platform/platform';

/**
 * - `inactive`: nothing is asked of the screen: the preference is off, or
 *   there is no ECU connected.
 * - `on`: the screen is being kept on.
 * - `unsupported`: the preference is on, but this browser cannot keep the
 *   screen on.
 * - `refused`: the browser would not keep the screen on (low battery, for
 *   example).
 * - `released`: the browser ended the lock, such as when the page was hidden.
 *   It is asked for again when the page is shown.
 */
export type ScreenWakeStatus =
  'inactive' | 'on' | 'unsupported' | 'refused' | 'released';

export interface ScreenWakeState {
  status: ScreenWakeStatus;
}

/**
 * Keeps the screen on while an ECU is connected, if the user has chosen
 * that. The lock is released as soon as the connection ends or the choice
 * is turned off. Plain TypeScript, read through `useSyncExternalStore`.
 */
export class ScreenWake {
  private state: ScreenWakeState = { status: 'inactive' };
  private readonly listeners = new Set<() => void>();
  private enabled = false;
  private hold: WakeLockHold | undefined;
  private stopWatchingHold: (() => void) | undefined;
  // Bumped each time the lock is wanted or not, so a slow request can tell
  // that it has been superseded.
  private generation = 0;
  private requesting = false;
  private readonly stops: (() => void)[];

  constructor(
    private readonly wakeLock: WakeLockPlatform,
    private readonly session: EcuSession,
  ) {
    this.stops = [
      session.subscribe(() => {
        this.sync();
      }),
      wakeLock.onVisible(() => {
        // The system takes the lock back while the page is hidden.
        if (this.state.status === 'released') {
          this.sync();
        }
      }),
    ];
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): ScreenWakeState => this.state;

  /** Whether this browser can keep the screen on at all. */
  readonly available = (): boolean => this.wakeLock.available();

  /** Whether the user wants the screen kept on while connected. */
  readonly setEnabled = (enabled: boolean): void => {
    if (enabled !== this.enabled) {
      this.enabled = enabled;
      this.sync();
    }
  };

  /** Releases the lock and stops following the connection. */
  readonly dispose = (): void => {
    for (const stop of this.stops) {
      stop();
    }

    this.enabled = false;
    this.sync();
  };

  private wanted(): boolean {
    const { connection, link } = this.session.getSnapshot();

    // The link goes as soon as a connection starts to end, ahead of the
    // connection's status.
    return (
      this.enabled && connection.status === 'connected' && link !== undefined
    );
  }

  private sync(): void {
    if (!this.wanted()) {
      this.generation++;
      this.requesting = false;
      this.letGo();
      this.setStatus('inactive');

      return;
    }

    if (this.hold || this.requesting) {
      return;
    }

    if (!this.wakeLock.available()) {
      this.setStatus('unsupported');

      return;
    }

    const generation = ++this.generation;

    this.requesting = true;
    this.wakeLock.request().then(
      (hold) => {
        if (generation !== this.generation) {
          // Not wanted any more by the time it was granted.
          void hold.release().catch(() => undefined);

          return;
        }

        this.requesting = false;
        this.hold = hold;
        this.stopWatchingHold = hold.onReleased(() => {
          if (this.hold === hold) {
            this.hold = undefined;
            this.stopWatchingHold = undefined;
            this.setStatus('released');
          }
        });
        this.setStatus('on');
      },
      () => {
        if (generation === this.generation) {
          this.requesting = false;
          this.setStatus('refused');
        }
      },
    );
  }

  private letGo(): void {
    const hold = this.hold;

    this.stopWatchingHold?.();
    this.stopWatchingHold = undefined;
    this.hold = undefined;

    // A lock the browser has already ended has nothing to release.
    void hold?.release().catch(() => undefined);
  }

  private setStatus(status: ScreenWakeStatus): void {
    if (status === this.state.status) {
      return;
    }

    this.state = { status };

    for (const listener of this.listeners) {
      listener();
    }
  }
}
