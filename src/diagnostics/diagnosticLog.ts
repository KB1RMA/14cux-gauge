// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * - `event`: something the app did or saw (connect, port details, disconnect).
 * - `tx` / `rx`: bytes written to or read from the serial port.
 * - `error`: a failure, with the raw error name and message.
 */
export type DiagnosticKind = 'event' | 'tx' | 'rx' | 'error';

export interface DiagnosticEntry {
  /** `Date.now()` when the entry was recorded. */
  time: number;
  kind: DiagnosticKind;
  message: string;
}

export interface DiagnosticLogOptions {
  /** Entries kept from the start of the log, so the first connection attempt survives. */
  headCapacity?: number;
  /** Most recent entries kept after the head fills; older ones are dropped. */
  tailCapacity?: number;
  now?: () => number;
  /** Called with every `event` and `error` entry (not bytes), for example to echo it to the console. */
  mirror?: (entry: DiagnosticEntry) => void;
}

/** What the log holds: the first entries, how many were dropped, then the latest. */
export interface DiagnosticSnapshot {
  startedAt: number;
  head: readonly DiagnosticEntry[];
  dropped: number;
  tail: readonly DiagnosticEntry[];
}

/**
 * A bounded, in-memory record of serial traffic and connection events, for
 * the user to download and share when something goes wrong. A busy link
 * produces hundreds of entries a second, so it keeps the start of the log
 * (where a failed connection shows up) and a rolling window of the latest.
 * Nothing leaves the browser unless the user downloads the file.
 */
export class DiagnosticLog {
  readonly startedAt: number;
  readonly #headCapacity: number;
  readonly #tailCapacity: number;
  readonly #now: () => number;
  readonly #mirror: ((entry: DiagnosticEntry) => void) | undefined;
  readonly #head: DiagnosticEntry[] = [];
  /** A ring buffer; `#tailNext` is where the next entry goes. */
  readonly #tail: DiagnosticEntry[] = [];
  #tailNext = 0;
  #dropped = 0;

  constructor(options: DiagnosticLogOptions = {}) {
    this.#headCapacity = options.headCapacity ?? 5_000;
    this.#tailCapacity = Math.max(1, options.tailCapacity ?? 50_000);
    this.#now = options.now ?? Date.now;
    this.#mirror = options.mirror;
    this.startedAt = this.#now();
  }

  record(kind: DiagnosticKind, message: string): void {
    const entry: DiagnosticEntry = { time: this.#now(), kind, message };

    if (kind === 'event' || kind === 'error') {
      this.#mirror?.(entry);
    }

    if (this.#head.length < this.#headCapacity) {
      this.#head.push(entry);

      return;
    }

    if (this.#tail.length < this.#tailCapacity) {
      this.#tail.push(entry);
    } else {
      this.#tail[this.#tailNext] = entry;
      this.#dropped++;
    }

    this.#tailNext = (this.#tailNext + 1) % this.#tailCapacity;
  }

  snapshot(): DiagnosticSnapshot {
    const tail =
      this.#tail.length < this.#tailCapacity
        ? [...this.#tail]
        : [
            ...this.#tail.slice(this.#tailNext),
            ...this.#tail.slice(0, this.#tailNext),
          ];

    return {
      startedAt: this.startedAt,
      head: [...this.#head],
      dropped: this.#dropped,
      tail,
    };
  }
}

/** Echoes an entry to the browser console, for anyone with the dev tools open. */
export function consoleMirror(entry: DiagnosticEntry): void {
  console.info(`[14cux-gauge] ${entry.message}`);
}

/** Bytes as space-separated upper-case hex, e.g. `5A 7C`. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

/** An error's name and message, which the friendly UI text hides. */
export function describeRawError(error: unknown): string {
  if (error instanceof Error) {
    // DOMException's name says more than its message ("NetworkError").
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
