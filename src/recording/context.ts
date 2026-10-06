// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { SessionSummary } from '../storage/sessionStore';

export interface RecordingValue {
  /** The session being recorded, or `undefined` when not recording. */
  active: SessionSummary | undefined;
  /** Whether {@link start} would record: connected, and storage is open. */
  canRecord: boolean;
  /** Why the last recording stopped by itself, if a write failed. */
  error: string | undefined;
  /**
   * A recording the user has just stopped, to offer a name and notes for;
   * cleared by {@link dismissFinished}. Recordings that stop by themselves
   * (the link dropped, a write failed) keep their default name.
   */
  finished: SessionSummary | undefined;
  /** Starts recording every snapshot into a new session. */
  start(): Promise<void>;
  /** Stops recording and sets {@link finished}. */
  stop(): Promise<void>;
  dismissFinished(): void;
  /**
   * Stops recording because something else needs the link. What was
   * recorded is kept under its default name, with no prompt to rename it.
   */
  interrupt(): Promise<void>;
}

export const RecordingContext = createContext<RecordingValue | undefined>(
  undefined,
);
