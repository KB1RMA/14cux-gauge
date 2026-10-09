// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { UnreadableRecord } from '../model/record';
import type { RomSummary } from '../model/rom';
import type { SaveFeedback } from '../platform/saveFile';

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
      kind: 'read';
      fileName: string;
      image: RomSummary;
      /** Whether a copy was kept in the browser; `false` if storage failed. */
      kept: boolean;
      /** Why the file was not saved; `undefined` once it was. */
      notSaved: SaveFeedback | undefined;
    }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

export interface RomsValue {
  /** The saved images, newest first; `undefined` while storage opens. */
  images: RomSummary[] | undefined;
  /** Saved images that cannot be read, shown so they can be deleted. */
  unreadable: UnreadableRecord[];
  /** Whether saved images outlive the page; false when storage is unavailable. */
  persistent: boolean;
  /** Set while the image is being read. */
  progress: RomProgress | undefined;
  /** How the last read ended, until dismissed. */
  outcome: RomOutcome | undefined;
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
