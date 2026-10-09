// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import { createContext } from 'react';
import type {
  FinishedOutcome,
  WriteId,
  WriteLogEntry,
  WriteOutcome,
} from '../model/write';

/** A write that has started; it holds the ECU until `finish` is called. */
export interface WriteHandle {
  /** The connection the write was sent to. */
  ecu: Ecu;
  /** Ends the write and records how it went. Later calls do nothing. */
  finish(outcome: FinishedOutcome): void;
}

export interface EcuWriteValue {
  /** The write running on the current connection, if any. */
  running: WriteId | undefined;
  /** How each write last went on the current connection. */
  outcomes: Partial<Record<WriteId, WriteOutcome>>;
  /** The write that started or ended most recently. */
  latest: WriteId | undefined;
  /**
   * Starts a write that the caller ends itself, as a repeating test does.
   * Returns `undefined`, and starts nothing, if not connected or if another
   * write is running.
   */
  begin(id: WriteId): WriteHandle | undefined;
  /**
   * Runs a one-off write: `task` makes the ECU calls and returns the
   * sentence to report when it succeeds. Settles `true` if it succeeded,
   * `false` if it failed or could not start.
   */
  run(id: WriteId, task: (ecu: Ecu) => Promise<string>): Promise<boolean>;
  /**
   * Calls `watcher` as each write starts and again as it ends, on any
   * connection, first with the write running on the current connection, if
   * there is one. Returns a function that stops watching.
   */
  watch(watcher: (entry: WriteLogEntry) => void): () => void;
}

export const EcuWriteContext = createContext<EcuWriteValue | undefined>(
  undefined,
);
