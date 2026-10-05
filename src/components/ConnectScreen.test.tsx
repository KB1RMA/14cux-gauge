// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EcuProvider } from '../ecu/EcuProvider';
import { expectNoAxeViolations } from '../test-support/a11y';
import { ConnectScreen } from './ConnectScreen';

function renderScreen() {
  return render(
    <EcuProvider>
      <ConnectScreen />
    </EcuProvider>,
  );
}

describe('ConnectScreen', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serial');
  });

  it('explains when the browser has no Web Serial, and still offers demo mode', () => {
    expect('serial' in navigator).toBe(false);

    renderScreen();

    expect(screen.getByRole('note')).toHaveTextContent(
      /Web Serial needs Chrome, Edge or Opera on a desktop computer, or Firefox 151 or later/,
    );
    expect(
      screen.queryByRole('button', { name: 'Connect to ECU' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demo mode' })).toBeEnabled();
  });

  it('has no detectable accessibility violations, with or without Web Serial', async () => {
    const { container, unmount } = renderScreen();

    await expectNoAxeViolations(container);
    unmount();
    Object.defineProperty(navigator, 'serial', {
      value: {},
      configurable: true,
    });

    const supported = renderScreen();

    await expectNoAxeViolations(supported.container);
  });

  it('offers a serial connection when Web Serial is available', () => {
    Object.defineProperty(navigator, 'serial', {
      value: {},
      configurable: true,
    });

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

    Object.defineProperty(navigator, 'serial', {
      value: {},
      configurable: true,
    });

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
