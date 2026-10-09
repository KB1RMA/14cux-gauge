// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { StorageContext } from './context';

/**
 * The open storage, or `undefined` while it is being opened. For the
 * sessions, recording and ROM providers only: views use `useSessions` and
 * `useRoms`, which never hand out the stores themselves.
 */
export function useStorage() {
  return use(StorageContext);
}
