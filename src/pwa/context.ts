// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { AppStatusStore } from './appStatusStore';

export const AppStatusContext = createContext<AppStatusStore | undefined>(
  undefined,
);
