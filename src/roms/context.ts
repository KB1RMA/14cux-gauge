// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { RomSummary } from '../storage/romStore';

export interface RomProgress {
  bytesRead: number;
  total: number;
  /** `Date.now()` when the read started. */
  startedAt: number;
  /** The user has asked to stop; the read ends after the block in flight. */
  cancelling: boolean;
}

export type RomOutcome =
  | {
      kind: 'saved';
      fileName: string;
      image: RomSummary;
      /** Whether a copy was kept in the browser; `false` if storage failed. */
      kept: boolean;
    }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

export interface RomsValue {
  /** The saved images, newest first; `undefined` while storage opens. */
  images: RomSummary[] | undefined;
  /** Whether saved images outlive the page; false when storage is unavailable. */
  persistent: boolean;
  /** Set while the image is being read. */
  progress: RomProgress | undefined;
  /** How the last read ended, until dismissed. */
  outcome: RomOutcome | undefined;
  /**
   * Pauses live polling, stops any recording, reads the ROM image, keeps a
   * copy in the browser and downloads it.
   */
  read(): Promise<void>;
  /** Stops a read in progress. */
  cancel(): void;
  dismissOutcome(): void;
  /** Downloads a saved image again. */
  download(image: RomSummary): Promise<void>;
  remove(image: RomSummary): Promise<void>;
}

export const RomsContext = createContext<RomsValue | undefined>(undefined);
