// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * The listeners a store tells when what it holds changes. A store's
 * `subscribe` is {@link Listeners.subscribe}, and it calls
 * {@link Listeners.notify} after each change it makes.
 */
export class Listeners {
  private readonly listeners = new Set<() => void>();

  /** Adds `listener`; returns a function that removes it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
