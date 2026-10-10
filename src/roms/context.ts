// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { RomSummary } from '../model/rom';
import type { RomReaderState } from './romReader';

export type { RomOutcome, RomProgress } from './romReader';

export interface RomsValue extends RomReaderState {
  /**
   * Pauses live polling, stops any recording, reads the ROM image, keeps a
   * copy in the browser and saves it as a file.
   */
  read(): Promise<void>;
  /** Stops a read in progress. */
  cancel(): void;
  dismissOutcome(): void;
  /** Saves a kept image as a file again; says so only if that fails. */
  download(image: RomSummary): Promise<void>;
  /** Deletes a saved image, readable or not, by its `id`. */
  remove(id: string): Promise<void>;
}

export const RomsContext = createContext<RomsValue | undefined>(undefined);
