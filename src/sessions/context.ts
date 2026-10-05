// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { ObservableSessionStore } from '../storage/observableSessionStore';

export interface SessionsValue {
  /** The recorded sessions; `undefined` while storage is being opened. */
  store: ObservableSessionStore | undefined;
  /** Whether sessions outlive the page; false when storage is unavailable. */
  persistent: boolean;
}

export const SessionsContext = createContext<SessionsValue | undefined>(
  undefined,
);
