// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { ReactNode } from 'react';
import { StorageContext } from './context';
import type { StorageController } from './storageController';

export interface StorageProviderProps {
  children: ReactNode;
  /**
   * The controller to provide, as `createAppServices` built it. Its owner
   * closes it; the provider only exposes it.
   */
  controller: StorageController;
}

/** Provides the storage controller to the providers built on it. */
export function StorageProvider({
  children,
  controller,
}: StorageProviderProps) {
  return <StorageContext value={controller}>{children}</StorageContext>;
}
