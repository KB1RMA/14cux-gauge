// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { PlatformContext } from './context';
import type { Platform } from './platform';

/** Serial ports, file saves, storage and settings where the app is running. */
export function usePlatform(): Platform {
  return use(PlatformContext);
}
