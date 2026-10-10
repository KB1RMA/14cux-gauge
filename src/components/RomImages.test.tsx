// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WRITE_HOLDER } from '../ecuWrite/writes';
import { RecordingProvider } from '../recording/RecordingProvider';
import { RomsProvider } from '../roms/RomsProvider';
import { memoryStorage } from '../storage/openStorage';
import { StorageController } from '../storage/storageController';
import { StorageProvider } from '../storage/StorageProvider';
import { connectedSession } from '../test-support/ecuSession';
import { WriteHarness } from '../test-support/WriteHarness';
import { RomImages } from './RomImages';

describe('RomImages', () => {
  it('says why, and reads nothing, when a write takes the link after the read was confirmed', async () => {
    const user = userEvent.setup();
    const { session } = await connectedSession(new SimulatedTransport());

    const storage = new StorageController(() =>
      Promise.resolve(memoryStorage()),
    );

    onTestFinished(() => {
      storage.dispose();
    });
    render(
      <WriteHarness session={session}>
        <StorageProvider controller={storage}>
          <RecordingProvider>
            <RomsProvider>
              <RomImages />
            </RomsProvider>
          </RecordingProvider>
        </StorageProvider>
      </WriteHarness>,
    );

    await user.click(screen.getByRole('button', { name: 'Save ROM image' }));

    const dialog = screen.getByRole('alertdialog', {
      name: 'Read the ROM image?',
    });

    // A write starts while the confirmation is open.
    act(() => {
      session.acquire(WRITE_HOLDER);
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Read ROM image' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The ROM image was not read: a write to the ECU started first. Try again when it finishes. Nothing was saved.',
    );
    expect(
      screen.queryByRole('alertdialog', { name: /ROM image/ }),
    ).not.toBeInTheDocument();
    expect(session.getSnapshot().pollingPaused).toBe(false);
  });
});
