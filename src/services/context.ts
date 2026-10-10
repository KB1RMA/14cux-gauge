// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { AppServices } from '../appServices';

/**
 * The controllers the app runs on. Hooks read them through
 * `useSyncExternalStore`; nothing builds or ends one.
 */
export const ServicesContext = createContext<AppServices | undefined>(
  undefined,
);
