// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { SampleHistory } from '../history/sampleHistory';
import type { MetricKey } from '../metrics';
import type { LiveSnapshot } from '../model/snapshot';
import type { EcuSource } from './connect';
import type { ConnectionState } from './connectionState';
import type { EcuLink, EcuSession, LinkHolder } from './session';

export interface EcuContextValue {
  state: ConnectionState;
  /** The connected link, for reads keyed by it; undefined unless connected. */
  link: EcuLink | undefined;
  /** What holds the link besides polling (a write, a ROM read), if anything. */
  holder: LinkHolder | undefined;
  connect(source: EcuSource): Promise<void>;
  disconnect(): Promise<void>;
  /** Connects again to the last source (same serial port, or demo). */
  reconnect(): Promise<void>;
  /** Whether live polling is paused so another read has the link to itself. */
  pollingPaused: boolean;
  /**
   * Calls `listener` with every snapshot the poller takes, from any
   * connection, until the returned function is called. Unlike the live data,
   * no snapshot is skipped between renders, and each holds only the chosen
   * readings, not those a view asked for.
   */
  onSnapshot(listener: (snapshot: LiveSnapshot) => void): () => void;
}

/** The controller for the ECU link; see `EcuSession`. */
export const EcuSessionContext = createContext<EcuSession | undefined>(
  undefined,
);

/** Recent samples of every metric, for the graphs; cleared on each connect. */
export const HistoryContext = createContext<
  SampleHistory<MetricKey> | undefined
>(undefined);
