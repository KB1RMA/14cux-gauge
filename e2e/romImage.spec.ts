// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { readFile } from 'node:fs/promises';
import { buildSyntheticRom } from '../src/demo/syntheticRom';
import {
  connectionStatus,
  expect,
  expectNoAxeViolations,
  test,
} from './support/fixtures';

/** ROM address 0xC100, in the middle of the image. */
const PLANTED_ADDRESS = 0xc100;
const PLANTED_BYTES = [0xde, 0xad, 0xbe, 0xef];

test.describe('Saving the ROM image', () => {
  test('downloads the exact bytes of a serial ECU’s ROM and keeps a copy across a reload', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await emulatedSerial.poke(PLANTED_ADDRESS, PLANTED_BYTES);
    await page.getByRole('button', { name: 'Connect to ECU' }).click();
    await expect(connectionStatus(page)).toHaveText(
      'Serial ECU (7812 baud) · Polling',
    );

    await page.getByRole('button', { name: 'Save ROM image' }).click();

    const confirm = page.getByRole('alertdialog', {
      name: 'Read the ROM image?',
    });

    await expect(confirm).toContainText('Live readings stop');
    await expectNoAxeViolations(page, { within: '[role="alertdialog"]' });

    const download = page.waitForEvent('download');

    await confirm.getByRole('button', { name: 'Read ROM image' }).click();

    const file = await download;

    expect(file.suggestedFilename()).toBe('14cux-tune-R1234-ident-0xDE70.bin');

    const path = await file.path();
    const expected = buildSyntheticRom();

    expected.set(PLANTED_BYTES, PLANTED_ADDRESS - 0xc000);
    expect(new Uint8Array(await readFile(path))).toEqual(expected);

    await expect(
      page.getByText('A copy is kept in this browser.'),
    ).toBeVisible();
    await expect(connectionStatus(page)).toHaveText(
      'Serial ECU (7812 baud) · Polling',
    );
    await expectNoAxeViolations(page);

    await page.reload();
    await emulatedSerial.choosePort('grant');
    await page.getByRole('button', { name: 'Connect to ECU' }).click();
    const saved = page.getByRole('list', { name: 'Saved ROM images' });

    await expect(saved.getByText('Tune 1234, ident 0xDE70')).toBeVisible();
    await expectNoAxeViolations(page);

    // The kept copy downloads again, byte for byte, without reading the ECU.
    const again = page.waitForEvent('download');

    await saved
      .getByRole('button', { name: /^Download Tune 1234, ident 0xDE70, / })
      .click();

    const copy = await again;

    expect(copy.suggestedFilename()).toBe('14cux-tune-R1234-ident-0xDE70.bin');
    expect(new Uint8Array(await readFile(await copy.path()))).toEqual(expected);

    await saved
      .getByRole('button', { name: /^Delete Tune 1234, ident 0xDE70, / })
      .click();

    const remove = page.getByRole('alertdialog', {
      name: 'Delete this ROM image?',
    });

    await expectNoAxeViolations(page, { within: '[role="alertdialog"]' });
    await remove.getByRole('button', { name: 'Delete image' }).click();
    await expect(
      page.getByText('No images are kept in this browser yet.'),
    ).toBeVisible();
  });

  test('cancels a read of the demo ECU and downloads nothing', async ({
    page,
  }) => {
    let downloads = 0;

    page.on('download', () => {
      downloads++;
    });

    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await page.getByRole('button', { name: 'Save ROM image' }).click();

    const confirm = page.getByRole('alertdialog', {
      name: 'Read the ROM image?',
    });

    await expect(confirm).toContainText('synthetic image, not real ROM data');
    await confirm.getByRole('button', { name: 'Read ROM image' }).click();

    const progress = page.getByRole('alertdialog', {
      name: 'Reading the ROM image',
    });

    await expect(progress.getByRole('progressbar')).toBeVisible();
    await expectNoAxeViolations(page, { within: '[role="alertdialog"]' });
    await progress.getByRole('button', { name: 'Cancel' }).click();

    await expect(progress).toBeHidden();
    await expect(
      page.getByText('The read was cancelled. Nothing was saved.'),
    ).toBeVisible();
    await expect(connectionStatus(page)).toHaveText('Demo ECU · Polling');
    await expect(
      page.getByText('No images are kept in this browser yet.'),
    ).toBeVisible();
    expect(downloads).toBe(0);
  });
});
