// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { NotConnectedError } from '@kb1rma/libcomm14cux-ts';
import { describeError } from '../ecu/errors';
import type { FinishedOutcome, WriteId, WriteOutcome } from '../model/write';
import type { NotificationInput } from '../notifications/context';

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
 * The outcome of a write that was refused because the connection had already
 * closed, so nothing was sent. Check `Ecu.isConnected()` before starting a
 * write to tell this apart from a link lost part-way through.
 */
export function notConnectedOutcome(id: WriteId): FinishedOutcome {
  return {
    status: 'failed',
    message: `${WRITES[id].failed}. ${describeError(new NotConnectedError('Not connected to ECU'))}`,
  };
}

/**
 * The outcome of a write that threw after it started. Only a bad argument,
 * which the library rejects before any I/O, counts as nothing written. A
 * `NotConnectedError` does not: the transport also throws it when the link
 * drops part-way through, after earlier memory writes (see
 * `notConnectedOutcome` for a connection that was already closed).
 *
 * @param afterWrites - The write had already written to the ECU before this
 *   error, as a repeating test does, so it is partial whatever the error.
 */
export function failureOutcome(
  id: WriteId,
  error: unknown,
  afterWrites = false,
): FinishedOutcome {
  const nothingWritten = !afterWrites && error instanceof RangeError;
  const text = WRITES[id];

  return nothingWritten
    ? { status: 'failed', message: `${text.failed}. ${describeError(error)}` }
    : {
        status: 'partial',
        message: `${text.partial}. ${describeError(error)}`,
      };
}

/** The words for an outcome, or for a write still running. */
export function describeOutcome(id: WriteId, outcome: WriteOutcome): string {
  return outcome.status === 'running' ? WRITES[id].running : outcome.message;
}

/**
 * The app-wide notification for a write starting or ending. Each write has
 * its own, so one finishing on an old connection does not replace a write
 * running on the new one. A partial write is an error: the ECU may be left
 * partly changed.
 */
export function writeNotification(
  id: WriteId,
  outcome: WriteOutcome,
): NotificationInput {
  return {
    key: `ecuWrite:${id}`,
    tone:
      outcome.status === 'running'
        ? 'progress'
        : outcome.status === 'done'
          ? 'success'
          : 'error',
    title: WRITES[id].name,
    message: describeOutcome(id, outcome),
  };
}
