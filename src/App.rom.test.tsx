// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { App } from './App';
import { browserPlatform } from './platform/browser';
import type * as demoEngine from './demo/demoEngine';
import { buildSyntheticRom } from './demo/syntheticRom';
import { openStorage } from './storage/openStorage';
import type { UnreadableRecord } from './model/record';
import type { RomSummary } from './model/rom';
import { MemoryRomStore } from './storage/romStore';
import { expectNoAxeViolations } from './test-support/a11y';
import { storageWith } from './test-support/storage';
import { plantRecords } from './test-support/storedRecords';
import { fakeUsageCounter } from './test-support/usageCounter';

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

const DEMO_FILE = '14cux-demo-synthetic-tune-R1234-ident-0xDE70.bin';

/** Records what the page offers for download. */
function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];

  URL.createObjectURL = (blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);

    return 'blob:rom';
  };

  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });

  return { blobs, names };
}

function firstBlob({ blobs }: { blobs: Blob[] }): Blob {
  const [blob] = blobs;

  if (!blob) {
    throw new Error('Nothing was offered for download');
  }

  return blob;
}

async function connectDemo(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Demo mode' }));
  await screen.findByRole('heading', { name: 'Live data' });
}

function renderApp(store = new MemoryRomStore()) {
  return render(
    <App
      pollIntervalMs={{ demo: 10 }}
      usageCounter={fakeUsageCounter()}
      platform={browserPlatform({
        storage: { open: storageWith({ roms: store }) },
      })}
    />,
  );
}

describe('Saving the ROM image', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks first, shows progress, downloads the image and keeps a copy', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    const { container } = renderApp();

    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Save ROM image' }));

    const confirm = await screen.findByRole('alertdialog', {
      name: 'Read the ROM image?',
    });

    expect(confirm).toHaveTextContent('Live readings stop');
    expect(confirm).toHaveTextContent('synthetic image, not real ROM data');
    expect(confirm).not.toHaveTextContent('recording in progress');
    expect(downloads.names).toEqual([]);
    await expectNoAxeViolations(container);

    await user.click(
      within(confirm).getByRole('button', { name: 'Read ROM image' }),
    );

    const progress = await screen.findByRole('alertdialog', {
      name: 'Reading the ROM image',
    });

    expect(within(progress).getByRole('progressbar')).toBeInTheDocument();
    // The dialog hides the rest of the page from role queries.
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(
      'Polling paused while the ROM is read',
    );

    await waitFor(
      () => {
        expect(downloads.names).toEqual([DEMO_FILE]);
      },
      { timeout: 10_000 },
    );
    await waitFor(() => {
      expect(progress).not.toBeInTheDocument();
    });

    expect(new Uint8Array(await firstBlob(downloads).arrayBuffer())).toEqual(
      buildSyntheticRom(),
    );
    expect(
      await screen.findByText(`Downloaded ${DEMO_FILE}.`, { exact: false }),
    ).toHaveTextContent('A copy is kept in this browser.');

    const saved = within(
      screen.getByRole('list', { name: 'Saved ROM images' }),
    );

    expect(saved.getByText('Tune 1234, ident 0xDE70')).toBeInTheDocument();
    expect(saved.getByText(/16,384 bytes/)).toBeInTheDocument();
    expect(saved.getByText(/^[0-9a-f]{64}$/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save ROM image' }),
    ).toHaveFocus();
    await expectNoAxeViolations(container);
  });

  it('downloads a saved image again, byte for byte, and deletes it', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();

    renderApp();
    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Save ROM image' }));
    await user.click(
      await screen.findByRole('button', { name: 'Read ROM image' }),
    );
    await screen.findByRole(
      'list',
      { name: 'Saved ROM images' },
      {
        timeout: 10_000,
      },
    );
    downloads.names.length = 0;
    downloads.blobs.length = 0;

    await user.click(
      screen.getByRole('button', { name: /^Download Tune 1234, ident 0xDE70/ }),
    );
    await waitFor(() => {
      expect(downloads.names).toEqual([DEMO_FILE]);
    });
    expect(new Uint8Array(await firstBlob(downloads).arrayBuffer())).toEqual(
      buildSyntheticRom(),
    );

    await user.click(
      screen.getByRole('button', { name: /^Delete Tune 1234, ident 0xDE70/ }),
    );

    const confirm = await screen.findByRole('alertdialog', {
      name: 'Delete this ROM image?',
    });

    await user.click(
      within(confirm).getByRole('button', { name: 'Delete image' }),
    );
    expect(
      await screen.findByText('No images are kept in this browser yet.'),
    ).toBeInTheDocument();
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

  it('shows no images, rather than failing, when the saved ones cannot be listed', async () => {
    const user = userEvent.setup();

    class UnreadableRoms extends MemoryRomStore {
      override list(): Promise<RomSummary[]> {
        return Promise.reject(new DOMException('Gone', 'UnknownError'));
      }

      override listUnreadable(): Promise<UnreadableRecord[]> {
        return Promise.reject(new DOMException('Gone', 'UnknownError'));
      }
    }

    renderApp(new UnreadableRoms());
    await connectDemo(user);

    expect(
      await screen.findByText('No images are kept in this browser yet.'),
    ).toBeInTheDocument();
  });

  it('shows an image that cannot be read, and deletes it', async () => {
    const user = userEvent.setup();
    const factory = new IDBFactory();

    await plantRecords(factory, {
      roms: [
        {
          id: 'damaged',
          source: 'serial',
          readAt: 1000,
          tuneNumber: 3652,
          tuneIdent: 0x23,
          size: 4,
          sha256: undefined,
        },
      ],
    });

    const { container } = render(
      <App
        pollIntervalMs={{ demo: 10 }}
        usageCounter={fakeUsageCounter()}
        platform={browserPlatform({
          storage: { open: () => openStorage(factory) },
        })}
      />,
    );

    await connectDemo(user);

    const list = await screen.findByRole('list', { name: 'Saved ROM images' });

    expect(list).toHaveTextContent(
      'Image that can’t be readbytes: Invalid input. Its ID is damaged.',
    );
    await expectNoAxeViolations(container);

    await user.click(
      within(list).getByRole('button', {
        name: 'Delete image that can’t be read, damaged',
      }),
    );

    const confirm = screen.getByRole('alertdialog', {
      name: 'Delete this ROM image?',
    });

    expect(confirm).toHaveTextContent(
      'This image, which cannot be read, will be deleted from this browser.',
    );
    await user.click(
      within(confirm).getByRole('button', { name: 'Delete image' }),
    );
    expect(
      await screen.findByText('No images are kept in this browser yet.'),
    ).toBeInTheDocument();
  });
});
