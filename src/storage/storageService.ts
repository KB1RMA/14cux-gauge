// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { AppStorage } from './openStorage';

/**
 * Opens the sessions and ROM image stores once, as the services are built,
 * and closes them with the services. `getSnapshot` is `undefined` until they
 * are open. Plain TypeScript, so the controllers that use the stores and React
 * (through `useSyncExternalStore`) share one copy.
 */
export class StorageService {
  private storage: AppStorage | undefined;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  /** @param open - Opens the storage; the platform's `storage.open`. */
  constructor(open: () => Promise<AppStorage>) {
    void open().then((opened) => {
      if (this.disposed) {
        opened.close();

        return;
      }

      this.storage = opened;

      for (const listener of [...this.listeners]) {
        listener();
      }
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The open storage, or `undefined` while it is being opened. */
  readonly getSnapshot = (): AppStorage | undefined => this.storage;

  /** Closes the storage, now or as soon as it has finished opening. */
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.storage?.close();
    this.storage = undefined;
  }
}
