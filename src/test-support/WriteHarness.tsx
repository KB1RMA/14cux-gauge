// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useState, type ReactNode } from 'react';
import type { EcuSession } from '../ecu/session';
import { EcuWriteProvider } from '../ecuWrite/EcuWriteProvider';
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { describeOutcome } from '../ecuWrite/writes';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { ReadingsProvider } from '../readings/ReadingsProvider';
import { TestSessionServices } from './TestApp';

/** The latest write's state, as the controller holds it. */
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

/** Views that read from the ECU, on `session`'s connection. */
export function SessionHarness({
  session,
  children,
}: {
  session: EcuSession;
  children: ReactNode;
}) {
  return (
    <TestSessionServices session={session}>
      <PreferencesProvider>
        <ReadingsProvider>{children}</ReadingsProvider>
      </PreferencesProvider>
    </TestSessionServices>
  );
}

/**
 * Write panels on `session`'s connection, with buttons to disconnect or
 * leave the view (unmount `children`, as switching tab does) and come back.
 */
export function WriteHarness({
  session,
  children,
}: {
  session: EcuSession;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(true);

  return (
    <SessionHarness session={session}>
      <EcuWriteProvider>
        <WriteAnnouncement />
        <button type="button" onClick={() => void session.disconnect()}>
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
    </SessionHarness>
  );
}
