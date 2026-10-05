// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { expectNoAxeViolations } from './test-support/a11y';

/**
 * A stand-in for a Web Serial port: opens (or refuses to), never sends data,
 * and can fire the `disconnect` event a real port fires when unplugged.
 */
class FakeSerialPort extends EventTarget {
  opens = 0;
  failOpen = false;
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;

  open(): Promise<void> {
    this.opens++;

    if (this.failOpen) {
      return Promise.reject(
        new DOMException('Failed to open serial port.', 'NetworkError'),
      );
    }

    this.readable = new ReadableStream();
    this.writable = new WritableStream();

    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function installSerial(port: FakeSerialPort) {
  Object.defineProperty(navigator, 'serial', {
    value: { requestPort: () => Promise.resolve(port) },
    configurable: true,
  });
}

describe('App with a serial ECU', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serial');
  });

  it('reports a port that will not open and lets the user try again', async () => {
    const user = userEvent.setup();
    const port = new FakeSerialPort();

    port.failOpen = true;
    installSerial(port);
    render(<App />);

    await user.click(screen.getByRole('checkbox', { name: /Double-speed/ }));
    await user.click(screen.getByRole('button', { name: 'Connect to ECU' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Disconnected: The serial port could not be opened',
    );

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));

    await vi.waitFor(() => {
      expect(port.opens).toBe(2);
    });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stops and offers to reconnect when the port is unplugged', async () => {
    const user = userEvent.setup();
    const port = new FakeSerialPort();

    installSerial(port);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Connect to ECU' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Serial ECU (7812 baud) · Polling',
    );

    act(() => {
      port.dispatchEvent(new Event('disconnect'));
    });

    expect(
      await screen.findByRole('button', { name: 'Reconnect' }),
    ).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Disconnected: The serial port could not be opened or was disconnected.',
    );
    expect(
      screen.getByRole('button', { name: 'Connect to ECU' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });

  it('stays put when the user dismisses the port picker', async () => {
    const user = userEvent.setup();

    Object.defineProperty(navigator, 'serial', {
      value: {
        requestPort: () =>
          Promise.reject(new DOMException('No port selected', 'NotFoundError')),
      },
      configurable: true,
    });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Connect to ECU' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
