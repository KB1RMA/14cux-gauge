// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { StorageController } from './storageController';

/**
 * The app's storage controller, as `createAppServices` built it. There is no
 * default: `useStorage` throws outside `StorageProvider`.
 */
export const StorageContext = createContext<StorageController | undefined>(
  undefined,
);
