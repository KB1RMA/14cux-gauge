// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { MetricKey } from '../metrics';

export interface ReadingsContextValue {
  /** The readings the user has chosen, in display order. */
  chosen: readonly MetricKey[];
  /** Readings turned off; see `ReadingSettings`. */
  off: readonly MetricKey[];
  setOff(off: MetricKey[]): void;
  /**
   * Asks for readings to be taken while a view needs them, whether or not
   * they are chosen (the fuel map asks for its position). Returns a function
   * that withdraws the request.
   */
  request(keys: readonly MetricKey[]): () => void;
}

export const ReadingsContext = createContext<ReadingsContextValue | undefined>(
  undefined,
);
