// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useState, type ReactNode } from 'react';
import { DiagnosticsContext } from '../diagnostics/context';
import { EcuSessionContext, HistoryContext } from './contexts';
import { EcuSession, type EcuSessionOptions } from './session';

export interface EcuProviderProps extends Pick<
  EcuSessionOptions,
  'pollIntervalMs' | 'diagnostics'
> {
  children: ReactNode;
  /**
   * The controller to provide, taken once on mount. Its owner ends it;
   * without one the provider makes its own from the other props, and closes
   * it on unmount.
   */
  session?: EcuSession;
}

/** Provides the ECU link's controller, its diagnostic log and its history. */
export function EcuProvider({
  children,
  session,
  pollIntervalMs,
  diagnostics,
}: EcuProviderProps) {
  const [provided] = useState(
    () => session ?? new EcuSession({ pollIntervalMs, diagnostics }),
  );
  const owned = provided !== session;

  useEffect(
    () => () => {
      if (owned) {
        provided.dispose();
      }
    },
    [owned, provided],
  );

  return (
    <DiagnosticsContext value={provided.log}>
      <EcuSessionContext value={provided}>
        <HistoryContext value={provided.history}>{children}</HistoryContext>
      </EcuSessionContext>
    </DiagnosticsContext>
  );
}
