// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { LiveDataContext, type LiveData } from './contexts';

/** The latest snapshot from the poller, and its measured sample rate. */
export function useLiveData(): LiveData {
  const value = use(LiveDataContext);

  if (!value) {
    throw new Error('useLiveData must be used inside <EcuProvider>');
  }

  return value;
}
