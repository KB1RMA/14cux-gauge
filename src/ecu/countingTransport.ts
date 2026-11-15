// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Transport } from '@kb1rma/libcomm14cux-ts';

/**
 * Wraps a transport and counts the bytes read through it, so a failed
 * connection can tell a silent line from one that sent something unreadable.
 * Behaves exactly like `inner`.
 */
export class CountingTransport implements Transport {
  readonly #inner: Transport;
  #received = 0;

  constructor(inner: Transport) {
    this.#inner = inner;
  }

  /** Bytes read so far. */
  get received(): number {
    return this.#received;
  }

  open(): Promise<void> {
    return this.#inner.open();
  }

  close(): Promise<void> {
    return this.#inner.close();
  }

  write(data: Uint8Array): Promise<void> {
    return this.#inner.write(data);
  }

  async read(length: number, timeoutMs: number): Promise<Uint8Array> {
    const data = await this.#inner.read(length, timeoutMs);

    this.#received += data.length;

    return data;
  }
}
