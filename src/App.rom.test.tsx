// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { TestApp } from './test-support/TestApp';
import { browserPlatform } from './platform/browser';
import type * as demoEngine from './demo/demoEngine';
import { buildSyntheticRom } from './demo/syntheticRom';
import { openStorage } from './storage/openStorage';
import type { UnreadableRecord } from './model/record';
import type { RomSummary } from './model/rom';
import type { FilePlatform } from './platform/platform';
import { MemoryRomStore } from './storage/romStore';
import { expectNoAxeViolations } from './test-support/a11y';
import { connectDemo } from './test-support/demo';
import { noFileChosen } from './test-support/platform';
import { captureDownloads, renderApp } from './test-support/romApp';
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

function firstBlob({ blobs }: { blobs: Blob[] }): Blob {
  const [blob] = blobs;

  if (!blob) {
    throw new Error('Nothing was offered for download');
  }

  return blob;
}

/** Reads the demo ECU's ROM image, and waits for the read to end. */
async function readDemoRom(user: UserEvent) {
  await connectDemo(user);
  await user.click(screen.getByRole('button', { name: 'Save ROM image' }));
  await user.click(
    await screen.findByRole('button', { name: 'Read ROM image' }),
  );

  const progress = await screen.findByRole('alertdialog', {
    name: 'Reading the ROM image',
  });

  await waitFor(
    () => {
      expect(progress).not.toBeInTheDocument();
    },
    { timeout: 10_000 },
  );
}

/** Where every save is cancelled, as when a Save dialog is dismissed. */
const CANCELLED_SAVES: FilePlatform = {
  save: () => Promise.resolve('cancelled'),
  open: noFileChosen,
};

/** Where every save fails, as on a full disk. */
const FAILING_SAVES: FilePlatform = {
  save: () => Promise.reject(new Error('Disk full')),
  open: noFileChosen,
};

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

  it('says the image was read but not saved when the save is cancelled, and keeps a copy', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(new MemoryRomStore(), CANCELLED_SAVES);

    await readDemoRom(user);

    expect(
      await screen.findByText(/^The ROM image was read, but /),
    ).toHaveTextContent(
      `The ROM image was read, but ${DEMO_FILE} was not saved: the save was cancelled. A copy is kept in this browser; download it from the list below.`,
    );
    expect(screen.queryByText(/^Downloaded /)).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Saved ROM images' })).getByText(
        'Tune 1234, ident 0xDE70',
      ),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says when the image could not be saved, nor kept', async () => {
    const user = userEvent.setup();

    class FullRoms extends MemoryRomStore {
      override save(): Promise<RomSummary> {
        return Promise.reject(new Error('Quota exceeded'));
      }
    }

    renderApp(new FullRoms(), FAILING_SAVES);
    await readDemoRom(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `The ROM image was read, but ${DEMO_FILE} could not be saved: Error: Disk full. A copy could not be kept in this browser either, so nothing was saved.`,
    );
  });

  it('says when a kept image could not be saved again', async () => {
    const user = userEvent.setup();

    renderApp(new MemoryRomStore(), FAILING_SAVES);
    await readDemoRom(user);
    await user.click(
      within(await screen.findByRole('alert')).getByRole('button', {
        name: 'Dismiss',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: /^Download Tune 1234, ident 0xDE70/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `${DEMO_FILE} could not be saved: Error: Disk full. Nothing was saved.`,
    );
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
      <TestApp
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
