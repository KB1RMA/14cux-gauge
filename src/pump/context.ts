// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';

/**
 * Where a fuel pump test is: `once` and `continuous` while commanded,
 * `stopped` after one has ended (until the next starts or the link closes),
 * `undefined` if none has been run on this connection.
 */
export type FuelPumpPhase = 'once' | 'continuous' | 'stopped';

export interface FuelPumpValue {
  phase: FuelPumpPhase | undefined;
  /** Why the last test ended early, until the next one starts. */
  notice: string | undefined;
  /** Runs the pump for one timed run of the ECU's own. */
  runOnce(): void;
  /** Keeps running the pump until `stop`, a failure or the time limit. */
  runContinuously(): void;
  /** Stops asking the ECU to run the pump; it stops within one run. */
  stop(): void;
}

export const FuelPumpContext = createContext<FuelPumpValue | undefined>(
  undefined,
);
