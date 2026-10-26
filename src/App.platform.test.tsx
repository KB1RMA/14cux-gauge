// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { App } from './App';
import { TestApp } from './test-support/TestApp';
import { createAppServices } from './appServices';
import { buildSyntheticRom } from './demo/syntheticRom';
import type { FilePlatform, Platform } from './platform/platform';
import {
  memorySettings,
  noFileChosen,
  testPlatform,
} from './test-support/platform';
import { storageWith } from './test-support/storage';
import { fakeUsageCounter } from './test-support/usageCounter';

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
      grantedPorts: () => Promise.resolve([]),
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
      open: noFileChosen,
      save: (name, data, type) => {
        saved.push({ name, data, type });

        return Promise.resolve('saved');
      },
    },
    storage: { open: storageWith() },
    settings: memorySettings(),
    app: { userAgent: 'TestBrowser/1.0', reload: () => undefined },
    screen: testPlatform().screen,
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
      <TestApp
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
      <TestApp platform={platform} usageCounter={fakeUsageCounter()} />,
    );

    expect(
      await screen.findByRole('checkbox', { name: /Double-speed firmware/ }),
    ).toBeChecked();
    second.unmount();

    // The browser's own platform has neither the port nor the choice.
    render(<TestApp usageCounter={undefined} />);
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

  it('says when the diagnostic log could not be saved, but not when the user cancelled', async () => {
    const user = userEvent.setup();
    const { platform } = desktopPlatform();
    const save = vi.fn<FilePlatform['save']>();

    render(
      <TestApp
        platform={{ ...platform, files: { save, open: noFileChosen } }}
        usageCounter={undefined}
      />,
    );

    const footer = within(screen.getByRole('contentinfo'));

    save.mockResolvedValueOnce('cancelled');
    await user.click(
      footer.getByRole('button', { name: 'Download diagnostic log' }),
    );
    expect(save).toHaveBeenCalledOnce();
    expect(footer.queryByRole('alert')).not.toBeInTheDocument();

    save.mockRejectedValueOnce(new Error('Disk full.'));
    await user.click(
      footer.getByRole('button', { name: 'Download diagnostic log' }),
    );
    expect(await footer.findByRole('alert')).toHaveTextContent(
      /^14cux-gauge-log-[\dT-]+\.txt could not be saved: Error: Disk full\.$/,
    );

    // Trying again clears the message, and saving works this time.
    save.mockResolvedValueOnce('saved');
    await user.click(
      footer.getByRole('button', { name: 'Download diagnostic log' }),
    );
    expect(footer.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('App on a screen it can control', () => {
  /** A screen whose lock and full-screen state the test can see. */
  function controllableScreen() {
    const locks: { released: boolean }[] = [];
    const lockEnded = new Set<() => void>();
    const fullscreenListeners = new Set<() => void>();
    let fullscreen = false;
    let refuse = false;
    let failFullscreen = false;
    const platform: Platform['screen'] = {
      wakeLock: {
        available: () => true,
        request: () => {
          if (refuse) {
            return Promise.reject(new Error('Refused'));
          }

          const lock = { released: false };

          locks.push(lock);

          return Promise.resolve({
            release: () => {
              lock.released = true;

              return Promise.resolve();
            },
            onReleased: (listener) => {
              lockEnded.add(listener);

              return () => {
                lockEnded.delete(listener);
              };
            },
          });
        },
        onVisible: () => () => undefined,
      },
      fullscreen: {
        available: () => true,
        active: () => fullscreen,
        enter: () => {
          if (failFullscreen) {
            return Promise.reject(new Error('Refused'));
          }

          fullscreen = true;
          fullscreenListeners.forEach((listener) => {
            listener();
          });

          return Promise.resolve();
        },
        exit: () => {
          fullscreen = false;
          fullscreenListeners.forEach((listener) => {
            listener();
          });

          return Promise.resolve();
        },
        watch: (listener) => {
          fullscreenListeners.add(listener);

          return () => {
            fullscreenListeners.delete(listener);
          };
        },
      },
    };

    return {
      platform,
      locks,
      refuse: () => {
        refuse = true;
      },
      refuseFullscreen: () => {
        failFullscreen = true;
      },
      /** The browser ends every lock, as when the page is hidden. */
      endLocks: () => {
        for (const listener of [...lockEnded]) {
          listener();
        }
      },
    };
  }

  async function chooseKeepScreenOn(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Preferences' }));
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Keep the screen on while connected',
      }),
    );
    await user.keyboard('{Escape}');
    // Closing goes back in history, which the router finishes later.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  }

  it('keeps the screen on while connected, says so, and lets go on disconnect', async () => {
    const user = userEvent.setup();
    const { platform: screenPlatform, locks } = controllableScreen();

    render(
      <TestApp
        platform={testPlatform({ screen: screenPlatform })}
        pollIntervalMs={{ demo: 10 }}
        usageCounter={undefined}
      />,
    );

    await chooseKeepScreenOn(user);
    expect(locks).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Demo mode' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Demo ECU · Polling · Screen kept on',
    );
    expect(locks.map((lock) => lock.released)).toEqual([false]);

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    await vi.waitFor(() => {
      expect(locks.map((lock) => lock.released)).toEqual([true]);
    });
  });

  it('says when the browser would not keep the screen on', async () => {
    const user = userEvent.setup();
    const { platform: screenPlatform, refuse } = controllableScreen();

    refuse();
    render(
      <TestApp
        platform={testPlatform({ screen: screenPlatform })}
        pollIntervalMs={{ demo: 10 }}
        usageCounter={undefined}
      />,
    );

    await chooseKeepScreenOn(user);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Demo ECU · Polling · Screen may sleep: the browser refused to keep it on',
    );
  });

  it('shows the preference as unavailable, and the status as such, without a wake lock', async () => {
    const user = userEvent.setup();

    render(
      <TestApp
        platform={testPlatform()}
        pollIntervalMs={{ demo: 10 }}
        usageCounter={undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Preferences' }));

    const box = screen.getByRole('checkbox', {
      name: 'Keep the screen on while connected',
    });

    expect(box).toBeDisabled();
    expect(box).toHaveAccessibleDescription('Not supported in this browser.');
  });

  it('goes full screen from the dashboard and back', async () => {
    const user = userEvent.setup();
    const { platform: screenPlatform } = controllableScreen();

    render(
      <TestApp
        platform={testPlatform({ screen: screenPlatform })}
        pollIntervalMs={{ demo: 10 }}
        usageCounter={undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));

    const button = await screen.findByRole('button', { name: 'Full screen' });

    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('says full screen is not supported where the browser cannot', async () => {
    const user = userEvent.setup();

    render(
      <TestApp
        platform={testPlatform()}
        pollIntervalMs={{ demo: 10 }}
        usageCounter={undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));

    expect(
      await screen.findByRole('button', { name: 'Full screen' }),
    ).toBeDisabled();
    expect(screen.getByText('Not supported in this browser')).toBeVisible();
  });

  it('says when the browser ended keeping the screen on', async () => {
    const user = userEvent.setup();
    const { platform: screenPlatform, endLocks } = controllableScreen();

    render(
      <TestApp
        platform={testPlatform({ screen: screenPlatform })}
        pollIntervalMs={{ demo: 10 }}
        usageCounter={undefined}
      />,
    );

    await chooseKeepScreenOn(user);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));
    await screen.findByText(/Screen kept on/);

    act(() => {
      endLocks();
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Demo ECU · Polling · Screen may sleep: the browser ended keeping it on',
    );
  });

  it('says when a saved choice to keep the screen on cannot be met', async () => {
    const user = userEvent.setup();
    const base = testPlatform();

    base.settings.write('preferences', { keepScreenOn: true });
    render(
      <TestApp
        platform={base}
        pollIntervalMs={{ demo: 10 }}
        usageCounter={undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Demo ECU · Polling · Screen may sleep: this browser cannot keep it on',
    );
  });

  it('says when the browser would not go full screen', async () => {
    const user = userEvent.setup();
    const { platform: screenPlatform, refuseFullscreen } = controllableScreen();

    refuseFullscreen();
    render(
      <TestApp
        platform={testPlatform({ screen: screenPlatform })}
        pollIntervalMs={{ demo: 10 }}
        usageCounter={undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));
    await user.click(
      await screen.findByRole('button', { name: 'Full screen' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The browser would not go full screen.',
    );
  });
});
