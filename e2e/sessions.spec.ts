// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Locator, Page } from '@playwright/test';
import {
  connectionStatus,
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

/** Records about two seconds of the demo ECU, and stops. */
async function recordDemo(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Demo mode' }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(connectionStatus(page)).toHaveText(
    'Demo ECU · Polling · Recording',
  );
  await expect(page.getByText('0:02 recorded')).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();

  const dialog = page.getByRole('dialog', { name: 'Save recording' });

  await expect(dialog).toBeVisible();

  return dialog;
}

/**
 * Records a demo session named "Pump check" that runs the fuel pump test
 * once, and saves it.
 */
async function recordPumpCheck(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Demo mode' }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByText('0:01 recorded')).toBeVisible();
  await page.getByRole('button', { name: 'Run pump (once)' }).click();
  await page
    .getByRole('alertdialog', { name: 'Run the fuel pump once?' })
    .getByRole('button', { name: 'Run fuel pump' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Run pump (once)' }),
  ).toBeEnabled({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Stop recording' }).click();

  const dialog = page.getByRole('dialog', { name: 'Save recording' });

  await dialog.getByRole('textbox', { name: 'Name' }).fill('Pump check');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Adds a write to the stored session named `sessionName`, starting just after
 * its first recorded write, as a later version of the app could leave one.
 * This version cannot record such a write, so it is put into the browser
 * database directly.
 */
async function plantWrite(
  page: Page,
  sessionName: string,
  write: { id: string; write: string; outcome: Record<string, string> },
) {
  await page.evaluate(
    async ({ sessionName, write }) => {
      const request = <T>(req: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          req.onsuccess = () => {
            resolve(req.result);
          };

          req.onerror = () => {
            reject(req.error ?? new Error('IndexedDB request failed'));
          };
        });
      // No version: open the database at whatever version the app made.
      const db = await request(indexedDB.open('cuxGauge'));
      const read = db.transaction(['sessions', 'writes'], 'readonly');
      const sessions = await request<{ id: string; name: string }[]>(
        read.objectStore('sessions').getAll(),
      );
      const session = sessions.find(({ name }) => name === sessionName);

      if (!session) {
        throw new Error(`No stored session named ${sessionName}`);
      }

      const [first] = await request<{ startedAt: number; endedAt: number }[]>(
        read.objectStore('writes').index('sessionId').getAll(session.id),
      );

      if (!first) {
        throw new Error(`${sessionName} has no recorded writes`);
      }

      const tx = db.transaction('writes', 'readwrite');

      tx.objectStore('writes').put({
        ...write,
        sessionId: session.id,
        startedAt: first.endedAt + 100,
        endedAt: first.endedAt + 600,
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;

        tx.onerror = () => {
          reject(tx.error ?? new Error('IndexedDB write failed'));
        };
      });
      db.close();
    },
    { sessionName, write },
  );
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error('The element is not drawn');
  }

  return box;
}

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Views' });
}

test.describe('Recorded sessions', () => {
  test('keeps the writes to the ECU made while recording, and marks them in replay', async ({
    page,
  }) => {
    await recordPumpCheck(page);
    await nav(page).getByRole('link', { name: 'Sessions' }).click();
    await page.getByRole('link', { name: 'Pump check', exact: true }).click();

    const log = page.getByRole('region', { name: 'Writes to the ECU' });
    const row = log.getByRole('row').filter({ hasText: 'Fuel pump test' });

    await expect(row).toContainText('Done. Fuel pump stopped.');
    await expect(row).toContainText(/\d\.\d s/);
    await expectNoAxeViolations(page);

    await row.getByRole('button', { name: /^Go to Fuel pump test, / }).click();
    await expect(
      log.getByRole('rowheader', { name: 'Fuel pump test At the playhead' }),
    ).toBeVisible();

    // The graphs mark the write by name too, on the timeline overview. The
    // mark is a picture of the log above, so it is hidden from assistive tech.
    await page.getByRole('tab', { name: 'Graphs' }).click();
    await expect(
      page
        .getByRole('tabpanel', { name: 'Graphs' })
        .getByText('Fuel pump test', { exact: true }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('replays a session with a write a later version recorded, keeping that write as recorded', async ({
    page,
  }) => {
    await recordPumpCheck(page);
    await plantWrite(page, 'Pump check', {
      id: 'from-a-later-version',
      write: 'flashRom',
      outcome: { status: 'cancelled', message: 'Stopped by the user.' },
    });
    await nav(page).getByRole('link', { name: 'Sessions' }).click();
    await page.getByRole('link', { name: 'Pump check', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Pump check' }),
    ).toBeFocused();

    // The session still opens: its readings replay, and both writes are
    // listed, the unknown one by the id and result it was recorded with.
    await expect(reading(page, 'Engine speed')).toHaveText(/^\d+ rpm$/);

    const log = page.getByRole('region', { name: 'Writes to the ECU' });

    await expect(
      log.getByRole('row').filter({ hasText: 'Fuel pump test' }),
    ).toContainText('Done. Fuel pump stopped.');
    await expect(
      log.getByRole('row').filter({ hasText: 'flashRom' }),
    ).toContainText('Result not known: cancelled. Stopped by the user.');
    await expect(
      log.getByRole('row').filter({ hasText: 'flashRom' }),
    ).toContainText('0.5 s');
    await expectNoAxeViolations(page);
  });

  test('records, names, keeps across a reload, replays and deletes a session', async ({
    page,
  }) => {
    const dialog = await recordDemo(page);

    await expectNoAxeViolations(page, { within: '[role="dialog"]' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Warm idle');
    await dialog
      .getByRole('textbox', { name: 'Notes' })
      .fill('Idle settles at 750 rpm.');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Record', exact: true }),
    ).toBeVisible();

    // IndexedDB keeps it for the next visit.
    await page.reload();
    await nav(page).getByRole('link', { name: 'Sessions' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recorded sessions' }),
    ).toBeFocused();
    await expect(page.getByText('Idle settles at 750 rpm.')).toBeVisible();
    await expect(reading(page, 'Length')).toHaveText(/^0:0[2-3]$/);
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'Warm idle', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Warm idle' }),
    ).toBeFocused();
    await expect(reading(page, 'Engine speed')).toHaveText(/^\d+ rpm$/);

    const slider = page.getByRole('slider', { name: 'Playback position' });

    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await page.getByRole('radio', { name: '2×' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    // Two seconds at double speed reaches the end, and stops.
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({
      timeout: 5000,
    });
    await expect(slider).toHaveAttribute(
      'aria-valuetext',
      /^(\d+ seconds?) of \1$/,
    );

    await page.getByRole('tab', { name: 'Graphs' }).click();

    const rpm = page.getByRole('figure', { name: 'Engine speed (rpm)' });

    // eslint-disable-next-line playwright/no-raw-locators -- a canvas has no role; it is hidden from assistive tech
    await expect(rpm.locator('canvas')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Delete session' }).click();

    const confirm = page.getByRole('alertdialog', {
      name: 'Delete this session?',
    });

    await expectNoAxeViolations(page, { within: '[role="alertdialog"]' });
    await confirm.getByRole('button', { name: 'Delete session' }).click();
    await expect(page.getByText(/^No sessions yet\./)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recorded sessions' }),
    ).toBeFocused();
  });

  test('renames a session and edits its notes after saving it', async ({
    page,
  }) => {
    const dialog = await recordDemo(page);

    await dialog.getByRole('button', { name: 'Skip' }).click();
    await nav(page).getByRole('link', { name: 'Sessions' }).click();
    await page.getByRole('link', { name: /^Demo ECU, / }).click();

    const details = page.getByRole('region', { name: 'Name and notes' });
    const save = details.getByRole('button', { name: 'Save changes' });

    // Nothing to save until something changes.
    await expect(save).toBeDisabled();
    await details.getByRole('textbox', { name: 'Name' }).fill('Cold start');
    await details.getByRole('textbox', { name: 'Notes' }).fill('Choke smell.');
    await save.click();
    await expect(details.getByText('Changes saved.')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Cold start' }),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    await expectNoAxeViolations(page);

    await page.reload();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Cold start' }),
    ).toBeVisible();
    await expect(details.getByRole('textbox', { name: 'Notes' })).toHaveValue(
      'Choke smell.',
    );
    await nav(page).getByRole('link', { name: 'Sessions' }).click();
    await expect(
      page.getByRole('link', { name: 'Cold start', exact: true }),
    ).toBeVisible();
  });

  test('exports a session as a CSV file', async ({ page }) => {
    const dialog = await recordDemo(page);

    await dialog.getByRole('textbox', { name: 'Name' }).fill('Warm idle');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await nav(page).getByRole('link', { name: 'Sessions' }).click();
    await page.getByRole('link', { name: 'Warm idle', exact: true }).click();
    await expectNoAxeViolations(page);

    const download = page.waitForEvent('download');

    await page.getByRole('button', { name: 'Export CSV' }).click();

    const file = await download;

    expect(file.suggestedFilename()).toMatch(
      /^Warm-idle-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/,
    );

    const path = await file.path();
    const { readFile } = await import('node:fs/promises');
    const [header, first] = (await readFile(path, 'utf8')).split('\r\n');

    expect(header).toMatch(
      /^Time since start \(s\),Time \(UTC\),Engine speed \(rpm\),/,
    );
    expect(first).toMatch(/^0,\d{4}-\d{2}-\d{2}T/);
  });

  test('zooms, pans and scrubs the replay graphs on a timeline', async ({
    page,
  }) => {
    const dialog = await recordDemo(page);

    await dialog.getByRole('button', { name: 'Skip' }).click();
    await nav(page).getByRole('link', { name: 'Sessions' }).click();
    await page.getByRole('link', { name: /^Demo ECU, / }).click();
    await page.getByRole('tab', { name: 'Graphs' }).click();

    const showAll = page.getByRole('button', { name: 'Show all' });
    const position = page.getByRole('slider', { name: 'Playback position' });
    const rpm = page.getByRole('figure', { name: 'Engine speed (rpm)' });
    // eslint-disable-next-line playwright/no-raw-locators -- a canvas has no role; it is hidden from assistive tech
    const plot = rpm.locator('canvas');

    // The whole recording, to start with.
    await expect(
      page.getByText(/^Graphs show 0:00 to (0:0\d) of \1\.$/),
    ).toBeVisible();
    await expect(showAll).toBeDisabled();
    await plot.scrollIntoViewIfNeeded();

    const box = await boxOf(plot);
    const y = box.y + box.height / 2;
    const at = (fraction: number) => box.x + box.width * fraction;

    // Drag across part of a graph to zoom to it.
    await page.mouse.move(at(0.3), y);
    await page.mouse.down();
    await page.mouse.move(at(0.6), y, { steps: 5 });
    await page.mouse.up();
    await expect(showAll).toBeEnabled();
    await expectNoAxeViolations(page);

    // From the keyboard, the button keeps focus once it has nothing to do.
    await showAll.focus();
    await page.keyboard.press('Enter');
    await expect(showAll).toBeDisabled();
    await expect(showAll).toBeFocused();

    // Ctrl and the wheel zoom around the pointer.
    await page.mouse.move(at(0.5), y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -400);
    await page.keyboard.up('Control');
    await expect(showAll).toBeEnabled();

    // A click moves the playhead.
    await expect(position).toHaveAttribute('aria-valuenow', '0');
    await page.mouse.click(at(0.5), y);
    await expect(position).not.toHaveAttribute('aria-valuenow', '0');

    // The window's ends work from the keyboard too.
    await showAll.click();
    await page.getByRole('slider', { name: 'Graphs to' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(showAll).toBeEnabled();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`meets WCAG 2.2 AA, colour contrast included, in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });

      const dialog = await recordDemo(page);

      await expectNoAxeViolations(page, { within: '[role="dialog"]' });
      await dialog.getByRole('button', { name: 'Skip' }).click();
      await expect(page.getByText('0:02 recorded')).toBeHidden();

      await page.getByRole('button', { name: 'Record', exact: true }).click();
      await nav(page).getByRole('link', { name: 'Sessions' }).click();
      // The recording in progress, and the finished one.
      await expect(
        page
          .getByRole('region', { name: 'Recorded sessions' })
          .getByRole('listitem'),
      ).toHaveCount(2);
      await expect(
        page.getByRole('button', { name: /^Delete Demo ECU, / }).first(),
      ).toBeDisabled();
      await expectNoAxeViolations(page);

      await page
        .getByRole('link', { name: /^Demo ECU, / })
        .last()
        .click();
      await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});
