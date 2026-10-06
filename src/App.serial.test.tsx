// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, screen, within } from '@testing-library/react';
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

/** Captures what the app hands the browser to download. */
function captureDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:test/${String(blobs.size)}`;

      blobs.set(url, blob);

      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: () => undefined,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.href);

    if (blob) {
      files.push({ name: this.download, blob });
    }
  });

  return files;
}

describe('App with a serial ECU', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serial');
    vi.restoreAllMocks();
  });

  it('reports a port that will not open and lets the user try again', async () => {
    const user = userEvent.setup();
    const port = new FakeSerialPort();

    port.failOpen = true;
    installSerial(port);
    render(<App />);

    await user.click(screen.getByRole('checkbox', { name: /Double-speed/ }));
    await user.click(screen.getByRole('button', { name: 'Connect to ECU' }));

    // The failure dialog hides the page behind it until closed.
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Connection failed' }),
      ).getByRole('button', { name: 'Close' }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Disconnected: The serial port could not be opened',
    );

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));

    await vi.waitFor(() => {
      expect(port.opens).toBe(2);
    });

    // A new failure opens the dialog again.
    await screen.findByRole('dialog', { name: 'Connection failed' });
    await user.keyboard('{Escape}');
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

    await user.click(screen.getByRole('button', { name: 'Record' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Serial ECU (7812 baud) · Polling · Recording',
    );

    act(() => {
      port.dispatchEvent(new Event('disconnect'));
    });

    // The recording stopped with the link and keeps its default name; the
    // only dialog is the one explaining the failure.
    expect(
      await screen.findByRole('dialog', { name: 'Connection failed' }),
    ).toHaveTextContent(
      'Error: NetworkError: The serial port was disconnected.',
    );
    await user.keyboard('{Escape}');

    // Closing it lands on the obvious next step.
    expect(screen.getByRole('button', { name: 'Reconnect' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Disconnected: The serial port could not be opened or was disconnected.',
    );
    expect(
      screen.getByRole('button', { name: 'Connect to ECU' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(document.body);

    await user.click(screen.getByRole('button', { name: 'Sessions' }));

    expect(
      await screen.findByRole('button', { name: /^Serial ECU, / }),
    ).toBeInTheDocument();
  });

  it('saves a diagnostic log that shows why the port would not open', async () => {
    const user = userEvent.setup();
    const port = new FakeSerialPort();
    const downloads = captureDownloads();

    port.failOpen = true;
    installSerial(port);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Connect to ECU' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Connection failed',
    });

    expect(dialog).toHaveAccessibleDescription(
      'The serial port could not be opened or was disconnected. Another program may be using it.',
    );
    expect(dialog).toHaveTextContent(
      'Error: NetworkError: Failed to open serial port.',
    );

    const recent = within(dialog).getByRole('textbox', { name: 'Recent log' });

    expect(recent).toHaveAttribute('readonly');
    expect((recent as HTMLTextAreaElement).value).toMatch(
      /ERR Opening serial port failed: NetworkError: Failed to open serial port\.\n.*ERR Connection failed: NetworkError: Failed to open serial port\.$/,
    );
    await expectNoAxeViolations(document.body);

    await user.click(
      within(dialog).getByRole('button', { name: 'Download diagnostic log' }),
    );

    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.name).toMatch(/^14cux-gauge-log-.*\.txt$/);

    const text = (await downloads[0]?.blob.text()) ?? '';

    expect(text).toContain('Web Serial:  available');
    expect(text).toContain(
      'Connection:  error (serial): The serial port could not be opened',
    );
    expect(text).toContain('Asking the browser for a serial port');
    expect(text).toContain(
      'Serial port: USB vendor unknown, product unknown; 7812 baud, 8N1, no flow control',
    );
    expect(text).toContain(
      'ERR Opening serial port failed: NetworkError: Failed to open serial port.',
    );
    expect(text).toContain(
      'ERR Connection failed: NetworkError: Failed to open serial port.',
    );

    // Once closed, Details brings the dialog back.
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Details' }));
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Connection failed' }),
      ).getByRole('button', { name: 'Close' }),
    );

    expect(screen.getByRole('button', { name: 'Details' })).toHaveFocus();
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
