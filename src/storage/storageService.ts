// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { AppStorage } from './openStorage';

/**
 * Where the storage stands. `closed` means it was open and another window
 * took it away (upgrading the database): the page must be reloaded.
 * `failed` means the platform could not open any storage at all.
 */
export type StorageStatus =
  | { status: 'opening' }
  | { status: 'open'; storage: AppStorage }
  | { status: 'closed' }
  | { status: 'failed' };

const OPENING: StorageStatus = { status: 'opening' };

/**
 * Opens the sessions and ROM image stores once, as the services are built,
 * and closes them with the services. `getSnapshot` is `undefined` until they
 * are open, and again if they close or could not be opened; `getStatus` says
 * which. Plain TypeScript, so the controllers that use the stores and React
 * (through `useSyncExternalStore`) share one copy.
 */
export class StorageService {
  private current: StorageStatus = OPENING;
  private disposed = false;
  private stopWatching: (() => void) | undefined;
  private readonly listeners = new Set<() => void>();

  /** @param open - Opens the storage; the platform's `storage.open`. */
  constructor(open: () => Promise<AppStorage>) {
    // `open` may throw as well as reject.
    void new Promise<AppStorage>((resolve) => {
      resolve(open());
    }).then(
      (opened) => {
        if (this.disposed) {
          opened.close();

          return;
        }

        this.stopWatching = opened.onClosed(() => {
          this.stopWatching = undefined;
          this.set({ status: 'closed' });
        });
        this.set({ status: 'open', storage: opened });
      },
      () => {
        if (!this.disposed) {
          this.set({ status: 'failed' });
        }
      },
    );
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The open storage, or `undefined` unless it is open. */
  readonly getSnapshot = (): AppStorage | undefined =>
    this.current.status === 'open' ? this.current.storage : undefined;

  /** Whether storage is opening, open, closed by another window or failed. */
  readonly getStatus = (): StorageStatus => this.current;

  /** Closes the storage, now or as soon as it has finished opening. */
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.stopWatching?.();

    if (this.current.status === 'open') {
      this.current.storage.close();
    }

    this.current = OPENING;
  }

  private set(next: StorageStatus): void {
    this.current = next;

    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
