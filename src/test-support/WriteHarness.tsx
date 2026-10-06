// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import { useMemo, useState, type ReactNode } from 'react';
import { EcuContext } from '../ecu/contexts';
import { EcuWriteProvider } from '../ecuWrite/EcuWriteProvider';
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { describeOutcome } from '../ecuWrite/writes';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { ecuContextValue } from './ecuContext';

/** What the status bar would announce about writes. */
function WriteAnnouncement() {
  const { latest, outcomes, running } = useEcuWrite();
  const outcome = latest && outcomes[latest];

  return (
    <>
      <output aria-label="Write announcement">
        {latest && outcome ? describeOutcome(latest, outcome) : 'none'}
      </output>
      <output aria-label="Running write">{running ?? 'none'}</output>
    </>
  );
}

/**
 * Write panels connected to `ecu`, with buttons to drop the connection or
 * leave the view (unmount `children`, as switching tab does) and come back.
 */
export function WriteHarness({
  ecu,
  children,
}: {
  ecu: Ecu;
  children: ReactNode;
}) {
  const [connected, setConnected] = useState(true);
  const [shown, setShown] = useState(true);
  const value = useMemo(
    () => ecuContextValue(connected ? ecu : undefined),
    [connected, ecu],
  );

  return (
    <PreferencesProvider>
      <EcuContext value={value}>
        <EcuWriteProvider>
          <WriteAnnouncement />
          <button
            type="button"
            onClick={() => {
              setConnected(false);
            }}
          >
            Drop link
          </button>
          <button
            type="button"
            onClick={() => {
              setShown((previous) => !previous);
            }}
          >
            {shown ? 'Leave view' : 'Return to view'}
          </button>
          {shown ? children : null}
        </EcuWriteProvider>
      </EcuContext>
    </PreferencesProvider>
  );
}
