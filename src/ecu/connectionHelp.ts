// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { FailureStage } from './errors';

/** The app's own hardware section, which leads on to the cable's details. */
export const HARDWARE_NOTES_URL =
  'https://github.com/KB1RMA/14cux-gauge#hardware';
/** The cable's details, including the FTDI latency-timer setting. */
export const CABLE_NOTES_URL =
  'https://github.com/KB1RMA/comm14cux-ts#hardware';

export interface ConnectionHelp {
  /**
   * What the app saw, where that says more than the error itself. Without
   * one, the error's own description stands.
   */
  observed?: string;
  /** Likely causes of what was seen, for the user to rule out. */
  checks: readonly string[];
  /** Whether the cable's notes bear on this failure. */
  cableNotes: boolean;
  /** Whether the other baud rate is worth trying. */
  otherBaud: boolean;
}

const HELP: Record<FailureStage, ConnectionHelp> = {
  browser: {
    checks: [
      'The page address starts with https://, or the page is on localhost.',
      'Serial ports are not blocked for this site in the browser’s site settings.',
    ],
    cableNotes: false,
    otherBaud: false,
  },
  port: {
    checks: [
      'No other tab or program has the port open, such as a second copy of this app or a terminal.',
      'The cable is plugged in. Unplug it, plug it back in and choose its port again.',
      'On Linux, your user can use serial devices (usually the dialout group). Log in again after adding it.',
    ],
    cableNotes: false,
    otherBaud: false,
  },
  silent: {
    observed: 'The serial port opened, but nothing came back from the ECU.',
    checks: [
      'The ignition is on.',
      'You chose the port of the interface cable, not another serial port.',
      'The cable is a 5 V FTDI cable with its Rx line inverted.',
      'The cable has its 390 Ω resistor between Rx and ground.',
      'The grounding plug is not fitted.',
    ],
    cableNotes: true,
    otherBaud: false,
  },
  garbled: {
    observed:
      'Data came back on the serial port, but it was not a valid reply from the ECU.',
    checks: [
      'The baud rate matches the ECU: 7812 for standard firmware, 15625 for double-speed firmware.',
      'The cable’s Rx line is inverted.',
      'The cable’s connections are sound, as electrical noise can also corrupt replies.',
    ],
    cableNotes: true,
    otherBaud: true,
  },
  lost: {
    checks: [
      'The ignition is still on.',
      'The cable is still plugged in at both ends.',
    ],
    cableNotes: true,
    otherBaud: false,
  },
};

/** What to tell the user about a connection that failed at `stage`. */
export function connectionHelp(stage: FailureStage): ConnectionHelp {
  return HELP[stage];
}
