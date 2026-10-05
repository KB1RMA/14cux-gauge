// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { SessionsContext, type SessionsValue } from './context';

export function useSessions(): SessionsValue {
  const value = use(SessionsContext);

  if (!value) {
    throw new Error('useSessions must be used inside <SessionsProvider>');
  }

  return value;
}
