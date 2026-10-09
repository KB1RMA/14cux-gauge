// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { EcuSessionContext } from './contexts';
import type { EcuSession } from './session';

/** The controller for the ECU link, for the providers built on it. */
export function useEcuSession(): EcuSession {
  const session = use(EcuSessionContext);

  if (!session) {
    throw new Error('ECU hooks must be used inside <EcuProvider>');
  }

  return session;
}
