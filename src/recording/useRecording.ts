// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { RecordingContext, type RecordingValue } from './context';

export function useRecording(): RecordingValue {
  const value = use(RecordingContext);

  if (!value) {
    throw new Error('useRecording must be used inside <RecordingProvider>');
  }

  return value;
}
