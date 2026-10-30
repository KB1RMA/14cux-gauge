// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { browserPlatform } from '../platform/browser';
import { expectNoAxeViolations } from '../test-support/a11y';
import { TestServices } from '../test-support/TestApp';
import { ConnectScreen } from './ConnectScreen';

/** Where serial ports can be used, or not; never asked for one here. */
function platform(serial: boolean, secure = true) {
  return browserPlatform({
    serial: {
      available: () => serial,
      securePage: () => secure,
      requestPort: () => Promise.reject(new Error('Not offered in this test')),
      grantedPorts: () => Promise.resolve([]),
      open: () => {
        throw new Error('Not opened in this test');
      },
    },
  });
}

function renderScreen({ serial = true, secure = true } = {}) {
  return render(
    <TestServices platform={platform(serial, secure)}>
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

  it('says so when the page is not secure, rather than blame the browser', () => {
    renderScreen({ serial: false, secure: false });

    expect(screen.getByRole('note')).toHaveTextContent(
      'This page was not loaded over HTTPS or from localhost, so the browser does not offer serial ports here. Open it from its https:// address. Demo mode still works here.',
    );
    expect(screen.getByRole('button', { name: 'Demo mode' })).toBeEnabled();
  });

  it('lists what to check when the browser blocks the port picker', async () => {
    const user = userEvent.setup();

    render(
      <TestServices
        platform={browserPlatform({
          serial: {
            available: () => true,
            securePage: () => true,
            requestPort: () =>
              Promise.reject(new DOMException('Blocked', 'SecurityError')),
            grantedPorts: () => Promise.resolve([]),
            open: () => {
              throw new Error('Not offered in this test');
            },
          },
        })}
      >
        <ConnectScreen />
      </TestServices>,
    );
    await user.click(screen.getByRole('button', { name: 'Connect to ECU' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The browser blocked access to the serial port.',
    );
    expect(
      within(screen.getByRole('list', { name: 'What to check' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'The page address starts with https://, or the page is on localhost.',
      'Serial ports are not blocked for this site in the browser’s site settings.',
    ]);
    await expectNoAxeViolations(document.body);
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

describe('ConnectScreen reconnecting', () => {
  /** A platform with `granted` ports already allowed; records which opens. */
  function platformWith(granted: string[]) {
    const opened: string[] = [];
    const requested = vi.fn();
    const ports = granted.map((description) => ({ description }));

    return {
      opened,
      requested,
      platform: browserPlatform({
        serial: {
          available: () => true,
          securePage: () => true,
          requestPort: () => {
            requested();

            return Promise.reject(new Error('Not offered in this test'));
          },
          grantedPorts: () => Promise.resolve(ports),
          open: (port) => {
            opened.push(port.description);

            return {
              transport: new SimulatedTransport(),
              onLost: () => () => undefined,
            };
          },
        },
      }),
    };
  }

  it('offers an allowed port without the picker, and connects to it only when asked', async () => {
    const user = userEvent.setup();
    const { platform, opened, requested } = platformWith(['Test adapter']);

    render(
      <TestServices platform={platform}>
        <ConnectScreen />
      </TestServices>,
    );

    const reconnect = await screen.findByRole('button', {
      name: 'Reconnect to Test adapter',
    });

    // Nothing connects on its own.
    expect(opened).toEqual([]);

    await user.click(reconnect);

    await vi.waitFor(() => {
      expect(opened).toEqual(['Test adapter']);
    });
    expect(requested).not.toHaveBeenCalled();
  });

  it('tells several allowed ports apart', async () => {
    const { platform } = platformWith(['Same adapter', 'Same adapter']);

    render(
      <TestServices platform={platform}>
        <ConnectScreen />
      </TestServices>,
    );

    expect(
      await screen.findByRole('button', {
        name: 'Reconnect to Same adapter (port 1)',
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'Reconnect to Same adapter (port 2)',
      }),
    ).toBeEnabled();
  });

  it('offers no reconnect when no port has been allowed', async () => {
    const { platform } = platformWith([]);

    const { container } = render(
      <TestServices platform={platform}>
        <ConnectScreen />
      </TestServices>,
    );

    expect(
      await screen.findByRole('button', { name: 'Connect to ECU' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /^Reconnect/ }),
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('has no accessibility violations with a port to reconnect to', async () => {
    const { platform } = platformWith(['Test adapter']);

    const { container } = render(
      <TestServices platform={platform}>
        <ConnectScreen />
      </TestServices>,
    );

    await screen.findByRole('button', { name: 'Reconnect to Test adapter' });
    await expectNoAxeViolations(container);
  });
});
