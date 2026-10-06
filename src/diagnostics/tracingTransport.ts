// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Transport } from 'comm14cux-ts';
import { describeRawError, toHex, type DiagnosticLog } from './diagnosticLog';

/**
 * Wraps a transport and records every byte written and read, with how long
 * each read took and any error, in `log`. Behaves exactly like `inner`.
 */
export class TracingTransport implements Transport {
  readonly #inner: Transport;
  readonly #log: DiagnosticLog;
  readonly #now: () => number;

  constructor(
    inner: Transport,
    log: DiagnosticLog,
    now: () => number = () => performance.now(),
  ) {
    this.#inner = inner;
    this.#log = log;
    this.#now = now;
  }

  async open(): Promise<void> {
    this.#log.record('event', 'Opening serial port');

    try {
      await this.#inner.open();
    } catch (error) {
      this.#log.record(
        'error',
        `Opening serial port failed: ${describeRawError(error)}`,
      );

      throw error;
    }

    this.#log.record('event', 'Serial port open');
  }

  async close(): Promise<void> {
    this.#log.record('event', 'Closing serial port');

    try {
      await this.#inner.close();
    } catch (error) {
      this.#log.record(
        'error',
        `Closing serial port failed: ${describeRawError(error)}`,
      );

      throw error;
    }
  }

  async write(data: Uint8Array): Promise<void> {
    this.#log.record('tx', toHex(data));

    try {
      await this.#inner.write(data);
    } catch (error) {
      this.#log.record('error', `Write failed: ${describeRawError(error)}`);

      throw error;
    }
  }

  async read(length: number, timeoutMs: number): Promise<Uint8Array> {
    const started = this.#now();
    const elapsed = () => Math.round(this.#now() - started);

    try {
      const data = await this.#inner.read(length, timeoutMs);

      this.#log.record('rx', `${toHex(data)} (${String(elapsed())} ms)`);

      return data;
    } catch (error) {
      this.#log.record(
        'error',
        `Read of ${String(length)} byte(s) failed after ${String(elapsed())} ms (timeout ${String(timeoutMs)} ms): ${describeRawError(error)}`,
      );

      throw error;
    }
  }
}
