// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { useEffect, useState } from 'react';
import type { ReadingSelection } from '../ecu/session';
import { sessionOver } from '../test-support/ecuSession';
import { TestSessionServices } from '../test-support/TestApp';
import { ReadingsProvider } from './ReadingsProvider';
import { useReadings } from './useReadings';

/** Narrows reading to engine speed and coolant while it is switched on. */
function Focus() {
  const { focus } = useReadings();
  const [on, setOn] = useState(false);

  useEffect(
    () => (on ? focus(['engineRpm', 'coolantTempF']) : undefined),
    [focus, on],
  );

  return (
    <button
      type="button"
      onClick={() => {
        setOn(!on);
      }}
    >
      Toggle focus
    </button>
  );
}

describe('ReadingsProvider focus', () => {
  it('reads only the focused readings and the MIL until the focus is lifted', async () => {
    const user = userEvent.setup();
    const { session } = sessionOver([new SimulatedTransport()]);
    const select = vi.spyOn(session, 'select');

    const last = (): ReadingSelection => {
      const call = select.mock.calls.at(-1);

      if (!call) {
        throw new Error('The provider has not selected readings');
      }

      return call[0];
    };

    render(
      <TestSessionServices session={session}>
        <ReadingsProvider>
          <Focus />
        </ReadingsProvider>
      </TestSessionServices>,
    );

    // Everything is chosen by default.
    expect(last().polled.size).toBeGreaterThan(3);

    await user.click(screen.getByRole('button', { name: 'Toggle focus' }));

    expect([...last().polled].sort()).toEqual([
      'coolantTempF',
      'engineRpm',
      'milOn',
    ]);
    // What a recording keeps is still every chosen reading.
    expect(last().chosen.size).toBeGreaterThan(3);

    await user.click(screen.getByRole('button', { name: 'Toggle focus' }));

    expect(last().polled.size).toBeGreaterThan(3);
  });
});
