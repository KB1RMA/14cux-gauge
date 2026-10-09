// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { UnreadableRecord } from '../model/record';
import type { SessionChanges, SessionSummary } from '../model/session';
import type { LiveSnapshot } from '../model/snapshot';
import type { RecordedWrite } from '../model/write';

export type SessionList =
  | { status: 'loading' }
  | {
      status: 'loaded';
      sessions: SessionSummary[];
      /** Stored sessions that cannot be read, shown so they can be deleted. */
      unreadable: UnreadableRecord[];
    }
  | { status: 'failed' };

/** What was recorded in a session. */
export interface SessionContents {
  samples: LiveSnapshot[];
  writes: RecordedWrite[];
}

/**
 * The recorded sessions, and the only ways views change them. Recording
 * itself is `RecordingProvider`'s.
 */
export interface SessionsValue {
  /** Every recorded session, newest first, kept up to date as they change. */
  list: SessionList;
  /**
   * Whether sessions outlive the page; false when storage is unavailable,
   * and `undefined` while it is being opened.
   */
  persistent: boolean | undefined;
  /** Renames a session or changes its notes. */
  edit(id: string, changes: SessionChanges): Promise<void>;
  /** Deletes a session, readable or not, by its `id`. */
  remove(id: string): Promise<void>;
  /**
   * A session's samples, in the order recorded, and its writes to the ECU.
   * A session still being recorded gives what has been saved so far.
   */
  read(id: string): Promise<SessionContents>;
}

export const SessionsContext = createContext<SessionsValue | undefined>(
  undefined,
);
