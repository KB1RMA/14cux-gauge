// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { DiagnosticsContext } from './context';
import type { DiagnosticLog } from './diagnosticLog';

export function useDiagnostics(): DiagnosticLog {
  const value = use(DiagnosticsContext);

  if (!value) {
    throw new Error('useDiagnostics must be used inside <EcuProvider>');
  }

  return value;
}
