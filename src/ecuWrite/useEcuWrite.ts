// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { EcuWriteContext, type EcuWriteValue } from './context';

export function useEcuWrite(): EcuWriteValue {
  const value = use(EcuWriteContext);

  if (!value) {
    throw new Error('useEcuWrite must be used inside <EcuWriteProvider>');
  }

  return value;
}
