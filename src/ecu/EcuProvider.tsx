// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { ReactNode } from 'react';
import { DiagnosticsContext } from '../diagnostics/context';
import { EcuSessionContext, HistoryContext } from './contexts';
import type { EcuSession } from './session';

export interface EcuProviderProps {
  children: ReactNode;
  /**
   * The controller to provide, as `createAppServices` built it. Its owner
   * ends it; the provider only exposes it.
   */
  session: EcuSession;
}

/** Provides the ECU link's controller, its diagnostic log and its history. */
export function EcuProvider({ children, session }: EcuProviderProps) {
  return (
    <DiagnosticsContext value={session.log}>
      <EcuSessionContext value={session}>
        <HistoryContext value={session.history}>{children}</HistoryContext>
      </EcuSessionContext>
    </DiagnosticsContext>
  );
}
