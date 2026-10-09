// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { SessionList } from './context';
import { useSessions } from './useSessions';

/** Every recorded session, newest first, kept up to date as they change. */
export function useSessionList(): SessionList {
  return useSessions().list;
}
