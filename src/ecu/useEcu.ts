// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { EcuContext, type EcuContextValue } from './contexts';

export function useEcu(): EcuContextValue {
  const value = use(EcuContext);

  if (!value) {
    throw new Error('useEcu must be used inside <EcuProvider>');
  }

  return value;
}
