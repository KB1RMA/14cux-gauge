// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { ConnectionState } from './connectionState';
import type { LinkHolder } from './session';

/** Whether the readings being shown are being taken now, and if not, why. */
export type LiveStatus =
  | { live: true }
  | {
      live: false;
      /** Why readings are not current, in a sentence for the user. */
      reason: string;
    };

/**
 * Whether readings are live. They are only while connected and polling; in
 * every other state a reading on screen is not current.
 */
export function liveStatus(
  connection: ConnectionState,
  holder: LinkHolder | undefined,
  pollingPaused: boolean,
): LiveStatus {
  switch (connection.status) {
    case 'connecting':
      return {
        live: false,
        reason: 'Connecting to the ECU.',
      };
    case 'error':
      return {
        live: false,
        reason: `The connection was lost: ${connection.message}`,
      };
    case 'idle':
      return {
        live: false,
        reason: 'Not connected to an ECU.',
      };
    case 'connected':
      if (!pollingPaused) {
        return { live: true };
      }

      return {
        live: false,
        reason:
          holder?.kind === 'write'
            ? 'Polling is paused while the app writes to the ECU.'
            : holder?.kind === 'romRead'
              ? 'Polling is paused while the app reads the ECU’s ROM.'
              : 'Polling is paused.',
      };
  }
}
