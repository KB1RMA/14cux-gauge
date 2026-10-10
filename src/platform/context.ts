// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { Platform } from './platform';

/**
 * Where the app is running; `App` provides the one its services were built
 * on. There is no default: a view rendered outside it throws rather than
 * quietly running on the browser.
 */
export const PlatformContext = createContext<Platform | undefined>(undefined);
