// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { browserPlatform } from '../platform/browser';
import { expectNoAxeViolations } from '../test-support/a11y';
import { TestServices } from '../test-support/TestApp';
import { ConnectScreen } from './ConnectScreen';

/** Where serial ports can be used, or not; never asked for one here. */
function platform(serial: boolean) {
  return browserPlatform({
    serial: {
      available: () => serial,
      requestPort: () => Promise.reject(new Error('Not offered in this test')),
      open: () => {
        throw new Error('Not opened in this test');
      },
    },
  });
}

function renderScreen({ serial = true } = {}) {
  return render(
    <TestServices platform={platform(serial)}>
      <ConnectScreen />
    </TestServices>,
  );
}

describe('ConnectScreen', () => {
  it('explains when the browser has no Web Serial, and still offers demo mode', () => {
    renderScreen({ serial: false });

    expect(screen.getByRole('note')).toHaveTextContent(
      /Web Serial needs Chrome, Edge or Opera on a desktop computer, or Firefox 151 or later/,
    );
    expect(
      screen.queryByRole('button', { name: 'Connect to ECU' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demo mode' })).toBeEnabled();
  });

  it('has no detectable accessibility violations, with or without Web Serial', async () => {
    const { container, unmount } = renderScreen({ serial: false });

    await expectNoAxeViolations(container);
    unmount();

    const supported = renderScreen();

    await expectNoAxeViolations(supported.container);
  });

  it('offers a serial connection when Web Serial is available', () => {
    renderScreen();

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect to ECU' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: /Double-speed firmware/ }),
    ).not.toBeChecked();
  });

  it('remembers the double-speed choice for the next visit', async () => {
    const user = userEvent.setup();

    const first = renderScreen();

    await user.click(
      screen.getByRole('checkbox', { name: /Double-speed firmware/ }),
    );
    expect(localStorage.getItem('cuxGauge.doubleSpeed')).toBe('true');

    first.unmount();
    renderScreen();

    expect(
      screen.getByRole('checkbox', { name: /Double-speed firmware/ }),
    ).toBeChecked();
  });
});
