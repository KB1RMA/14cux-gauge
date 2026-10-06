// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { EcuSource } from './connect';

/**
 * Connection lifecycle: idle → connecting → connected (polling) → error | idle.
 * `source` is remembered in `error` so the user can reconnect.
 */
export type ConnectionState =
  /** `afterSession` is set once the user has disconnected from an ECU. */
  | { status: 'idle'; afterSession?: true }
  | { status: 'connecting'; source: EcuSource }
  | { status: 'connected'; source: EcuSource }
  | {
      status: 'error';
      source: EcuSource;
      message: string;
      /** The raw error name and message behind `message`, for diagnosis. */
      detail?: string;
    };

export type ConnectionAction =
  | { type: 'connect'; source: EcuSource }
  | { type: 'connected' }
  | { type: 'failed'; message: string; detail?: string }
  | { type: 'disconnected' };

export function connectionReducer(
  state: ConnectionState,
  action: ConnectionAction,
): ConnectionState {
  switch (action.type) {
    case 'connect':
      return { status: 'connecting', source: action.source };
    case 'connected':
      return state.status === 'connecting'
        ? { status: 'connected', source: state.source }
        : state;
    case 'failed':
      return state.status === 'idle'
        ? state
        : {
            status: 'error',
            source: state.source,
            message: action.message,
            ...(action.detail === undefined ? {} : { detail: action.detail }),
          };
    case 'disconnected':
      return { status: 'idle', afterSession: true };
  }
}
