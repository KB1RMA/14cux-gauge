// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { DiagnosticLog } from './diagnosticLog';

/** The serial trace and connection events; provided by `EcuProvider`. */
export const DiagnosticsContext = createContext<DiagnosticLog | undefined>(
  undefined,
);
