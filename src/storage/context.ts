// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { AppStorage } from './openStorage';

/**
 * The open storage, or `undefined` while it is being opened. Only the
 * providers that own sessions and ROM images read it; views go through them.
 */
export const StorageContext = createContext<AppStorage | undefined>(undefined);
