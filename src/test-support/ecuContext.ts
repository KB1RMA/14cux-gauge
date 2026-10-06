// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import type { ConnectionState } from '../ecu/connectionState';
import type { EcuContextValue } from '../ecu/contexts';

/** An ECU context connected to `ecu`, or idle without one. */
export function ecuContextValue(ecu: Ecu | undefined): EcuContextValue {
  const state: ConnectionState = ecu
    ? { status: 'connected', source: { kind: 'demo' } }
    : { status: 'idle' };

  return {
    state,
    ecu,
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    reconnect: () => Promise.resolve(),
    pollingPaused: false,
    pausePolling: () => Promise.resolve(() => undefined),
    onSnapshot: () => () => undefined,
  };
}
