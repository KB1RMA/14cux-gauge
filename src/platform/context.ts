// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import { browserPlatform } from './browser';
import type { Platform } from './platform';

/**
 * Where the app is running; `App` provides the one it was given. Components
 * rendered on their own, as in tests, get the browser's.
 */
export const PlatformContext = createContext<Platform>(browserPlatform());
