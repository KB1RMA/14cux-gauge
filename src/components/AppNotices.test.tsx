// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApp } from '../test-support/TestApp';
import type { BuildInfo } from '../buildInfo';
import type { AppStatusStoreOptions } from '../pwa/appStatusStore';
import { expectNoAxeViolations } from '../test-support/a11y';
import { testPlatform } from '../test-support/platform';

const RUNNING: BuildInfo = {
  version: '1.0.0',
  commit: 'aaa1111',
  releaseTag: null,
};
const NEWER: BuildInfo = {
  version: '1.1.0',
  commit: 'bbb2222',
  releaseTag: 'v1.1.0',
};

function options(
  published: BuildInfo,
  extra: Partial<AppStatusStoreOptions> = {},
): AppStatusStoreOptions {
  return {
    build: RUNNING,
    versionUrl: 'https://x.test/version.json',
    fetchJson: () => Promise.resolve(published),
    ...extra,
  };
}

describe('AppNotices', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says nothing when online and up to date', async () => {
    const { container } = render(
      <TestApp appStatus={options(RUNNING)} pollIntervalMs={{ demo: 10 }} />,
    );

    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(
      screen.queryByRole('region', { name: 'App status' }),
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says when the app is offline, and that it still works', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const { container } = render(<TestApp appStatus={options(RUNNING)} />);

    expect(await screen.findByRole('status')).toHaveTextContent(
      /^Offline\. Running 1\.0\.0 \(aaa1111\) from this device/,
    );
    await expectNoAxeViolations(container);
  });

  it('offers a newer build and reloads into it when nothing is connected', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const { container } = render(
      <TestApp appStatus={options(NEWER, { reload })} />,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'v1.1.0 is available.',
    );
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'Reload to update' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not offer a reload while the new build is still downloading', async () => {
    const registration = Object.assign(new EventTarget(), {
      waiting: null,
      installing: null,
      update: () => Promise.resolve(),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {},
      register: () => Promise.resolve(registration),
    }) as unknown as ServiceWorkerContainer;

    render(
      <TestApp
        appStatus={options(NEWER, {
          serviceWorker,
          serviceWorkerUrl: 'https://x.test/sw.js',
        })}
      />,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'v1.1.0 is available and is being downloaded.',
    );
    expect(
      screen.queryByRole('button', { name: 'Reload to update' }),
    ).not.toBeInTheDocument();
  });

  it('asks before reloading away from a connected ECU', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();

    render(
      <TestApp
        appStatus={options(NEWER, { reload })}
        pollIntervalMs={{ demo: 10 }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));
    await user.click(
      await screen.findByRole('button', { name: 'Reload to update' }),
    );

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Reload to update?',
    });

    expect(dialog).toHaveTextContent('closes the connection to the ECU');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(reload).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reload to update' }));
    await user.click(
      screen.getByRole('button', { name: 'Reload and disconnect' }),
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('says when saved sessions could not be opened, and reloads on request', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const { container } = render(
      <TestApp
        appStatus={options(RUNNING)}
        platform={testPlatform({
          storage: { open: () => Promise.reject(new Error('no disk')) },
          app: { reload },
        })}
      />,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved sessions and ROM images could not be opened. Reload this page to try again.',
    );
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
