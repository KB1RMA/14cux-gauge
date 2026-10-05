// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

test.describe('Demo mode', () => {
  test('connects, shows live data, reads and clears faults, disconnects', async ({
    page,
  }) => {
    await page.goto('./');
    await expect(
      page.getByRole('heading', { name: 'Connect to an ECU' }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Demo mode' }).click();

    await expect(
      page.getByRole('heading', { name: 'Live data' }),
    ).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('Demo ECU · Polling');
    await expect(reading(page, 'Engine speed')).toHaveText(/^\d+ rpm$/);
    await expect(
      page.getByRole('region', { name: 'Connection' }),
    ).toContainText(/\d+\.\d samples\/s/);
    await expect(reading(page, 'Tune number')).toHaveText('1234');
    await expect(reading(page, 'MIL')).toHaveText('On');
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Read fault codes' }).click();

    const faults = page.getByRole('list', { name: 'Stored fault codes' });

    await expect(faults.getByRole('listitem')).toHaveText([
      'Purge valve leak purgeValveLeak',
    ]);

    await page.getByRole('button', { name: 'Clear fault codes' }).click();

    const dialog = page.getByRole('alertdialog', {
      name: 'Clear fault codes?',
    });

    await expect(dialog).toContainText('cannot be recovered');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectNoAxeViolations(page, { within: '[role="alertdialog"]' });
    await dialog.getByRole('button', { name: 'Clear fault codes' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('No fault codes stored.')).toBeVisible();
    await expect(reading(page, 'MIL')).toHaveText('Off');

    await page.getByRole('button', { name: 'Disconnect' }).click();

    await expect(
      page.getByRole('heading', { name: 'Connect to an ECU' }),
    ).toBeFocused();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('cancelling the clear dialog keeps the fault codes', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await page.getByRole('button', { name: 'Read fault codes' }).click();
    // Opened from the keyboard: Safari does not focus a clicked button, so a
    // mouse click would leave no opener to return focus to.
    await page.getByRole('button', { name: 'Clear fault codes' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Clear fault codes' }),
    ).toBeFocused();
    await expect(
      page.getByRole('list', { name: 'Stored fault codes' }),
    ).toContainText('Purge valve leak');
    await expect(reading(page, 'MIL')).toHaveText('On');
  });

  test('works with the keyboard alone', async ({ page, browserName }) => {
    // Safari's Tab skips buttons unless the user turns on "Press Tab to
    // highlight each item"; Option-Tab always reaches them.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

    await page.goto('./');

    const demo = page.getByRole('button', { name: 'Demo mode' });

    // Tab from the top of the page until the demo button has focus, as a
    // keyboard user would.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press(tab);

      if (await demo.evaluate((el) => el === document.activeElement)) {
        break;
      }
    }

    await expect(demo).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Live data' }),
    ).toBeFocused();

    await page.getByRole('button', { name: 'Read fault codes' }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('list', { name: 'Stored fault codes' }),
    ).toBeVisible();

    await page.keyboard.press(tab);
    await expect(
      page.getByRole('button', { name: 'Clear fault codes' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    // Focus starts on Cancel; Tab moves to the destructive action.
    await page.keyboard.press(tab);
    await page.keyboard.press('Enter');
    await expect(page.getByText('No fault codes stored.')).toBeVisible();
  });
});
