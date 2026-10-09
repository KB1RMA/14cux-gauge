// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createAppServices } from './appServices';
import { buildSyntheticRom } from './demo/syntheticRom';
import type { Platform, SettingsBackend } from './platform/platform';
import { storageWith } from './test-support/storage';
import { fakeUsageCounter } from './test-support/usageCounter';

/** Settings kept in memory, as a desktop build might keep them in a file. */
function memorySettings(): SettingsBackend {
  const stored = new Map<string, string>();

  return {
    read: (key) => stored.get(key) ?? null,
    write: (key, value) => {
      const raw = JSON.stringify(value);

      stored.set(key, raw);

      return raw;
    },
    watch: () => () => undefined,
  };
}

/**
 * A platform that is not the browser: its one serial port leads to
 * comm14cux-ts's emulated ECU, and saved files are kept for the test.
 */
function desktopPlatform() {
  const saved: { name: string; data: string | Uint8Array; type: string }[] = [];
  const opened: number[] = [];
  const lostListeners = new Set<() => void>();
  const platform: Platform = {
    serial: {
      available: () => true,
      requestPort: () => Promise.resolve({ description: 'Test adapter' }),
      open: (_port, { baudRate }) => {
        const transport = new SimulatedTransport();

        transport.loadRom(buildSyntheticRom());
        opened.push(baudRate);

        return {
          transport,
          onLost: (listener) => {
            lostListeners.add(listener);

            return () => {
              lostListeners.delete(listener);
            };
          },
        };
      },
    },
    files: {
      save: (name, data, type) => {
        saved.push({ name, data, type });

        return Promise.resolve();
      },
    },
    storage: { open: storageWith() },
    settings: memorySettings(),
  };

  return {
    platform,
    saved,
    opened,
    unplug: () => {
      for (const listener of lostListeners) {
        listener();
      }
    },
  };
}

describe('App on another platform', () => {
  it('connects to a serial ECU, keeps settings and saves files through the platform alone', async () => {
    const user = userEvent.setup();
    const { platform, saved, opened } = desktopPlatform();

    // No Web Serial here: only the platform offers a port.
    expect('serial' in navigator).toBe(false);

    const first = render(
      <App
        platform={platform}
        pollIntervalMs={{ serial: 20 }}
        usageCounter={undefined}
      />,
    );

    await user.click(
      screen.getByRole('checkbox', { name: /Double-speed firmware/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Connect to ECU' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Serial ECU (15625 baud) · Polling',
    );
    expect(opened).toEqual([15625]);

    await user.click(
      screen.getByRole('button', { name: 'Download diagnostic log' }),
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toMatch(/^14cux-gauge-log-.*\.txt$/);
    expect(saved[0]?.type).toBe('text/plain');
    expect(saved[0]?.data).toContain('Web Serial:  available');
    expect(saved[0]?.data).toContain(
      'Serial port: Test adapter; 15625 baud, 8N1, no flow control',
    );

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    first.unmount();

    // The double-speed choice was kept by the platform, not the browser.
    const second = render(
      <App platform={platform} usageCounter={fakeUsageCounter()} />,
    );

    expect(
      await screen.findByRole('checkbox', { name: /Double-speed firmware/ }),
    ).toBeChecked();
    second.unmount();

    // The browser's own platform has neither the port nor the choice.
    render(<App usageCounter={undefined} />);
    expect(await screen.findByRole('note')).toHaveTextContent(
      /^This browser can't talk to serial ports\./,
    );
  });

  it('stops when the platform reports the port gone', async () => {
    const user = userEvent.setup();
    const { platform, unplug } = desktopPlatform();
    const services = createAppServices(platform, {
      pollIntervalMs: { serial: 20 },
    });

    onTestFinished(() => {
      services.dispose();
    });
    render(<App services={services} usageCounter={undefined} />);
    await user.click(screen.getByRole('button', { name: 'Connect to ECU' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Serial ECU (7812 baud) · Polling',
    );

    act(() => {
      unplug();
    });

    const dialog = await screen.findByRole('dialog', {
      name: 'Connection failed',
    });

    expect(dialog).toHaveAccessibleDescription(
      'The serial port could not be opened or was disconnected. Another program may be using it.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Disconnected: The serial port could not be opened or was disconnected.',
    );
  });
});
