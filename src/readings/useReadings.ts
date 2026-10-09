// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { ReadingsContext, type ReadingsContextValue } from './context';

/** Which readings are chosen, and ways to change or add to them. */
export function useReadings(): ReadingsContextValue {
  const value = use(ReadingsContext);

  if (!value) {
    throw new Error('useReadings must be used inside <ReadingsProvider>');
  }

  return value;
}
