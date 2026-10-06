// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Transport } from '@kb1rma/libcomm14cux-ts';

export interface LatencyOptions {
  /** Delay added to every read, in milliseconds. */
  perReadMs: number;
  /** Further delay for each byte read, in milliseconds. */
  perByteMs: number;
}

/**
 * Wraps a transport so each read takes time, roughly as a serial link
 * does. The demo uses it so that reading fewer values polls faster, as it
 * does with a real cable.
 */
export class LatencyTransport implements Transport {
  constructor(
    private readonly inner: Transport,
    private readonly latency: LatencyOptions,
  ) {}

  open(): Promise<void> {
    return this.inner.open();
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  write(data: Uint8Array): Promise<void> {
    return this.inner.write(data);
  }

  async read(length: number, timeoutMs: number): Promise<Uint8Array> {
    const delayMs =
      this.latency.perReadMs + this.latency.perByteMs * Math.max(0, length);

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    return this.inner.read(length, timeoutMs);
  }
}
