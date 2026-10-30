// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  InvalidReadingError,
  NotConnectedError,
  ProtocolError,
  ReadCancelledError,
  TimeoutError,
} from '@kb1rma/libcomm14cux-ts';

/**
 * Whether an error is a transient link fault worth retrying: a missed or
 * garbled reply. Anything else (port closed, cable unplugged) is fatal.
 */
export function isTransientLinkError(error: unknown): boolean {
  return error instanceof TimeoutError || error instanceof ProtocolError;
}

/** Whether the user dismissed the browser's serial port picker. */
export function isPortPickerCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/**
 * A coarse, fixed category for an error, carrying nothing from its message;
 * safe to count in anonymous usage statistics.
 */
export type ErrorReason =
  | 'timeout'
  | 'protocol'
  | 'closed'
  | 'cancelled'
  | 'invalid-reading'
  | 'no-port'
  | 'port-in-use'
  | 'port-error'
  | 'blocked'
  | 'other';

export function errorReason(error: unknown): ErrorReason {
  if (error instanceof TimeoutError) {
    return 'timeout';
  }

  if (error instanceof ProtocolError) {
    return 'protocol';
  }

  if (error instanceof NotConnectedError) {
    return 'closed';
  }

  if (error instanceof ReadCancelledError) {
    return 'cancelled';
  }

  if (error instanceof InvalidReadingError) {
    return 'invalid-reading';
  }

  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotFoundError':
        return 'no-port';
      case 'InvalidStateError':
        return 'port-in-use';
      case 'NetworkError':
        return 'port-error';
      case 'SecurityError':
        return 'blocked';
    }
  }

  return 'other';
}

/**
 * How far a connection got before it failed, going by what the app saw:
 *
 * - `browser`: the browser refused to let the page use the port.
 * - `port`: the port could not be opened or used.
 * - `silent`: the port opened, but not one byte came back.
 * - `garbled`: bytes came back, but never a valid reply.
 * - `lost`: the ECU had been answering on this connection, then the replies
 *   stopped or went bad.
 *
 * A browser with no Web Serial never gets as far as connecting; the connect
 * screen says so.
 */
export type FailureStage = 'browser' | 'port' | 'silent' | 'garbled' | 'lost';

/** What had happened on a connection by the time it failed. */
export interface ConnectionProgress {
  /** Whether its port opened. */
  opened: boolean;
  /** Whether the ECU gave a valid reply. */
  answered: boolean;
  /** Bytes read from the port. */
  bytesReceived: number;
}

/** The errors Web Serial gives for bytes on the wire it could not make out. */
const LINE_ERRORS: ReadonlySet<string> = new Set([
  'BreakError',
  'FramingError',
  'ParityError',
]);

/** The stage a connection reached when `error` ended it. */
export function failureStage(
  error: unknown,
  { opened, answered, bytesReceived }: ConnectionProgress,
): FailureStage {
  if (!opened) {
    return errorReason(error) === 'blocked' ? 'browser' : 'port';
  }

  const lineFault =
    isTransientLinkError(error) ||
    (error instanceof DOMException && LINE_ERRORS.has(error.name));

  if (!lineFault) {
    return 'port';
  }

  if (answered) {
    return 'lost';
  }

  return error instanceof TimeoutError && bytesReceived === 0
    ? 'silent'
    : 'garbled';
}

/** Turns any error from the ECU stack or Web Serial into a sentence for the UI. */
export function describeError(error: unknown): string {
  if (error instanceof TimeoutError) {
    return 'The ECU stopped responding. Check the cable, that the ignition is on, and that the baud rate matches the ECU firmware.';
  }

  if (error instanceof ProtocolError) {
    return 'The ECU sent an unexpected reply. Electrical noise or the wrong baud rate can cause this.';
  }

  if (error instanceof NotConnectedError) {
    return 'The connection to the ECU was closed.';
  }

  if (error instanceof ReadCancelledError) {
    return 'The read was cancelled.';
  }

  if (error instanceof InvalidReadingError) {
    return 'The ECU returned a value outside the range its firmware can produce.';
  }

  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotFoundError':
        return 'No serial port was selected.';
      case 'InvalidStateError':
        return 'The serial port is already open, perhaps in another tab.';
      case 'NetworkError':
        return 'The serial port could not be opened or was disconnected. Another program may be using it.';
      case 'SecurityError':
        return 'The browser blocked access to the serial port. The page must be served over HTTPS or from localhost.';
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
