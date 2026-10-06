// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import { createContext } from 'react';
import type { SampleHistory } from '../history/sampleHistory';
import type { MetricKey } from '../metrics';
import type { EcuSource } from './connect';
import type { ConnectionState } from './connectionState';
import type { LiveSnapshot, PollerStats } from './poller';

export interface EcuContextValue {
  state: ConnectionState;
  /** The connected ECU, for on-demand reads; undefined unless connected. */
  ecu: Ecu | undefined;
  connect(source: EcuSource): Promise<void>;
  disconnect(): Promise<void>;
  /** Connects again to the last source (same serial port, or demo). */
  reconnect(): Promise<void>;
  /**
   * Calls `listener` with every snapshot the poller takes, from any
   * connection, until the returned function is called. Unlike the live data
   * context, no snapshot is skipped between renders, and each holds only
   * the chosen readings, not those a view asked for (see `request`).
   */
  /** Whether live polling is paused so another read has the link to itself. */
  pollingPaused: boolean;
  /**
   * Pauses live polling and settles once the link is free. The live readings
   * are cleared while paused, so no old value looks current. Call the result
   * to carry on; it does nothing if the connection has ended meanwhile.
   */
  pausePolling(): Promise<() => void>;
  onSnapshot(listener: (snapshot: LiveSnapshot) => void): () => void;
}

export interface LiveData {
  snapshot: LiveSnapshot | undefined;
  stats: PollerStats;
}

export const EcuContext = createContext<EcuContextValue | undefined>(undefined);
export const LiveDataContext = createContext<LiveData | undefined>(undefined);

/** Recent samples of every metric, for the graphs; cleared on each connect. */
export const HistoryContext = createContext<
  SampleHistory<MetricKey> | undefined
>(undefined);
