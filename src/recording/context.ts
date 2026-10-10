// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { RecorderState } from './recorder';

export interface RecordingValue extends RecorderState {
  /** Starts recording every snapshot into a new session. */
  start(): Promise<void>;
  /** Stops recording and sets {@link finished}. */
  stop(): Promise<void>;
  dismissFinished(): void;
}

export const RecordingContext = createContext<RecordingValue | undefined>(
  undefined,
);
