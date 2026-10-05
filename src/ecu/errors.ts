// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  InvalidReadingError,
  NotConnectedError,
  ProtocolError,
  ReadCancelledError,
  TimeoutError,
} from 'comm14cux-ts';

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
