// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { RomsContext, type RomsValue } from './context';

export function useRoms(): RomsValue {
  const value = use(RomsContext);

  if (!value) {
    throw new Error('useRoms must be used inside <RomsProvider>');
  }

  return value;
}
