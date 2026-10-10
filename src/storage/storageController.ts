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
 * Opens the app's storage once, when built, and closes it on `dispose`. It
 * exposes `subscribe` / `getSnapshot` for `useSyncExternalStore`, so views
 * say when storage is not usable rather than letting calls fail.
 */
export class StorageController {
  private snapshot: StorageStatus = OPENING;
  private readonly listeners = new Set<() => void>();
  private stopWatching: (() => void) | undefined;
  private disposed = false;

  constructor(open: () => Promise<AppStorage>) {
    // `open` may throw as well as reject.
    void new Promise<AppStorage>((resolve) => {
      resolve(open());
    }).then(
      (storage) => {
        if (this.disposed) {
          storage.close();

          return;
        }

        this.stopWatching = storage.onClosed(() => {
          this.stopWatching?.();
          this.stopWatching = undefined;
          this.set({ status: 'closed' });
        });
        this.set({ status: 'open', storage });
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

  readonly getSnapshot = (): StorageStatus => this.snapshot;

  /** Releases the storage, now or as soon as it has finished opening. */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.stopWatching?.();

    if (this.snapshot.status === 'open') {
      this.snapshot.storage.close();
    }

    this.listeners.clear();
  }

  private set(next: StorageStatus): void {
    this.snapshot = next;

    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
