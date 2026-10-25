// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as demoEngine from './demo/demoEngine';
import { MemoryRomStore } from './storage/romStore';
import { connectDemo } from './test-support/demo';
import { captureDownloads, renderApp } from './test-support/romApp';

// The demo link takes about 20 seconds to send a ROM; here it takes about one.
vi.mock('./demo/demoEngine', async (importOriginal) => {
  const original = await importOriginal<typeof demoEngine>();

  return {
    ...original,
    createDemoEngine: (
      options: Parameters<typeof original.createDemoEngine>[0],
    ) =>
      original.createDemoEngine({
        ...options,
        latency: { perReadMs: 1, perByteMs: 0.05 },
      }),
  };
});

describe('Saving the ROM image', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not read anything if the user backs out of the confirmation', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    const store = new MemoryRomStore();

    renderApp(store);
    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Save ROM image' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(downloads.names).toEqual([]);
    expect(await store.list()).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('Demo ECU · Polling');
  });

  it('cannot be read while a write to the ECU runs, and says why', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();

    renderApp();
    await connectDemo(user);

    const pump = within(screen.getByRole('region', { name: 'Fuel pump test' }));

    await user.click(
      pump.getByRole('button', { name: 'Run pump (continuous)' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Run fuel pump',
      }),
    );

    const save = within(
      screen.getByRole('region', { name: 'ROM image' }),
    ).getByRole('button', { name: 'Save ROM image' });

    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription(
      'Disabled while a write to the ECU runs: Fuel pump test.',
    );

    await user.click(pump.getByRole('button', { name: 'Stop fuel pump' }));
    // The pump runs on for up to two seconds, and holds the link until then.
    await waitFor(
      () => {
        expect(save).toBeEnabled();
      },
      { timeout: 5_000 },
    );
    expect(save).not.toHaveAccessibleDescription();
    expect(downloads.names).toEqual([]);
  });

  it('stops when cancelled, saves nothing and resumes polling', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    const store = new MemoryRomStore();

    renderApp(store);
    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Save ROM image' }));
    await user.click(
      await screen.findByRole('button', { name: 'Read ROM image' }),
    );

    const progress = await screen.findByRole('alertdialog', {
      name: 'Reading the ROM image',
    });

    await user.click(within(progress).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(progress).not.toBeInTheDocument();
    });

    expect(
      await screen.findByText('The read was cancelled. Nothing was saved.'),
    ).toBeInTheDocument();
    expect(downloads.names).toEqual([]);
    expect(await store.list()).toEqual([]);
    await waitFor(() => {});
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(screen.getByText(/^Demo ECU · Polling$/)).toBeInTheDocument();
  });

  it('stops a recording in progress, and says it will first', async () => {
    const user = userEvent.setup();

    captureDownloads();
    renderApp();
    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Record' }));
    // Recording starts once its session is created in storage.
    await screen.findByRole('button', { name: 'Stop recording' });
    await user.click(screen.getByRole('button', { name: 'Save ROM image' }));

    const confirm = await screen.findByRole('alertdialog', {
      name: 'Read the ROM image?',
    });

    expect(confirm).toHaveTextContent('The recording in progress stops');
    await user.click(
      within(confirm).getByRole('button', { name: 'Read ROM image' }),
    );
    await screen.findByRole('alertdialog', { name: 'Reading the ROM image' });
    await waitFor(
      () => {
        expect(
          screen.queryByRole('alertdialog', { name: 'Reading the ROM image' }),
        ).not.toBeInTheDocument();
      },
      { timeout: 10_000 },
    );
    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
  });
});
