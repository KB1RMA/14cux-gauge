// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from 'comm14cux-ts';
import { createContext } from 'react';
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
}

export interface LiveData {
  snapshot: LiveSnapshot | undefined;
  stats: PollerStats;
}

export const EcuContext = createContext<EcuContextValue | undefined>(undefined);
export const LiveDataContext = createContext<LiveData | undefined>(undefined);
