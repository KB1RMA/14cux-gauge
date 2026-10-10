// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * One end of a line that tells the same store in other windows that what it
 * holds has changed. A window never hears its own `post`.
 */
export interface ChangeChannel {
  /** Tells the other windows something changed. */
  post(): void;
  /** Calls `listener` when another window posts. */
  listen(listener: () => void): void;
  close(): void;
}

/**
 * Opens the channel called `name`. Windows that open the same name hear each
 * other. The browser's is built over `BroadcastChannel` by `platform/`; a
 * desktop build would relay from its main process.
 */
export type OpenChangeChannel = (name: string) => ChangeChannel;

/**
 * The listeners a store tells when what it holds changes. A store's
 * `subscribe` is {@link Listeners.subscribe}, and it calls
 * {@link Listeners.notify} after each change it makes. With a channel,
 * changes made in other windows reach the same listeners, and its own
 * changes are posted to them.
 */
export class Listeners {
  private readonly listeners = new Set<() => void>();
  private readonly channel: ChangeChannel | undefined;

  constructor(channel?: ChangeChannel) {
    this.channel = channel;
    channel?.listen(() => {
      this.dispatch();
    });
  }

  /** Adds `listener`; returns a function that removes it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Tells this window's listeners, and other windows, of a change. */
  notify(): void {
    this.channel?.post();
    this.dispatch();
  }

  /** Stops listening to other windows; the store must not be used after. */
  close(): void {
    this.channel?.close();
    this.listeners.clear();
  }

  private dispatch(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
