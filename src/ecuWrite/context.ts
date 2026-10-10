// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { EcuWritesState, FuelPumpHandle } from './ecuWrites';
import type { WriteRequest } from './writes';

export interface EcuWriteValue extends EcuWritesState {
  /**
   * Starts the fuel pump test's write, which the caller renews and ends
   * itself. Returns `undefined`, and starts nothing, if not connected or if
   * something else (another write, a ROM read) holds the link.
   */
  beginFuelPump(): FuelPumpHandle | undefined;
  /**
   * Runs a one-off write. Settles `true` if it succeeded, `false` if it
   * failed or could not start.
   */
  run(request: WriteRequest): Promise<boolean>;
}

export const EcuWriteContext = createContext<EcuWriteValue | undefined>(
  undefined,
);
