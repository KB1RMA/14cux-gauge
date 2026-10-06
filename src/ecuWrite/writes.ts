// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { NotConnectedError } from '@kb1rma/libcomm14cux-ts';
import { describeError } from '../ecu/errors';

/** Every feature that writes to the ECU. Only one may run at a time. */
export type WriteId = 'clearFaultCodes' | 'idleAirControl' | 'fuelPump';

/**
 * How a write went: `running` until it ends; `done`; `failed` when nothing
 * was written; `partial` when it failed after it may have written something.
 */
export type WriteOutcome =
  | { status: 'running' }
  | { status: 'done' | 'failed' | 'partial'; message: string };

export type FinishedOutcome = Exclude<WriteOutcome, { status: 'running' }>;

interface WriteText {
  /** Names the write where another control is waiting for it. */
  name: string;
  /** Announced while it runs. */
  running: string;
  /** Leads the error when it failed before writing anything. */
  failed: string;
  /** Leads the error when it failed after it may have written something. */
  partial: string;
}

/**
 * What each write is called. Every one makes more than one memory write, so a
 * failure part-way through can leave the ECU partly changed.
 */
export const WRITES: Record<WriteId, WriteText> = {
  clearFaultCodes: {
    name: 'Clear fault codes',
    running: 'Clearing fault codes',
    failed: 'The fault codes were not cleared',
    partial: 'Clearing may be incomplete',
  },
  idleAirControl: {
    name: 'Idle air control test',
    running: 'Idle air control test running',
    failed: 'The idle air control test did not run',
    partial: 'The idle air control test may have partly run',
  },
  fuelPump: {
    name: 'Fuel pump test',
    running: 'Fuel pump running',
    failed: 'The fuel pump test did not run',
    partial: 'The fuel pump test stopped and may have partly run',
  },
};

/**
 * The outcome of a write that threw. The library rejects a closed connection
 * or a bad argument before any I/O, so only those count as nothing written;
 * any other error may have come after the first memory write.
 *
 * @param afterWrites - The write had already written to the ECU before this
 *   error, as a repeating test does, so it is partial whatever the error.
 */
export function failureOutcome(
  id: WriteId,
  error: unknown,
  afterWrites = false,
): FinishedOutcome {
  const nothingWritten =
    !afterWrites &&
    (error instanceof NotConnectedError || error instanceof RangeError);
  const text = WRITES[id];

  return nothingWritten
    ? { status: 'failed', message: `${text.failed}. ${describeError(error)}` }
    : {
        status: 'partial',
        message: `${text.partial}. ${describeError(error)}`,
      };
}

/** The status bar's words for an outcome. */
export function describeOutcome(id: WriteId, outcome: WriteOutcome): string {
  return outcome.status === 'running' ? WRITES[id].running : outcome.message;
}
