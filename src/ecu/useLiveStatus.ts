// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { liveStatus, type LiveStatus } from './liveStatus';
import { useEcu } from './useEcu';

/** Whether readings are being taken now; see `liveStatus`. */
export function useLiveStatus(): LiveStatus {
  const { state, holder, pollingPaused } = useEcu();

  return liveStatus(state, holder, pollingPaused);
}
