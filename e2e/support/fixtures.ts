// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import AxeBuilder from '@axe-core/playwright';
import {
  test as base,
  expect,
  type Locator,
  type Page,
} from '@playwright/test';
import { join } from 'node:path';
import type { PortChoice } from '../browser/emulatedSerial';
import { EMULATED_SERIAL_DIR, EMULATED_SERIAL_FILE } from '../paths';

/** Spec-side handle on the emulated serial port inside the page. */
export interface EmulatedSerial {
  choosePort(choice: PortChoice): Promise<void>;
  opens(): Promise<SerialOptions[]>;
  poke(address: number, bytes: readonly number[]): Promise<void>;
  peek(address: number, length: number): Promise<number[]>;
  setSilent(silent: boolean): Promise<void>;
  unplug(): Promise<void>;
}

interface Fixtures {
  /** Fails the test if the page logs an error or throws. Always on. */
  pageErrors: undefined;
  /**
   * Installs the emulated serial port before the app loads. Request this
   * fixture before the first `page.goto`.
   */
  emulatedSerial: EmulatedSerial;
  /** Removes Web Serial, as in Safari or an older Firefox. */
  withoutWebSerial: undefined;
}

export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];

      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });
      await use(undefined);
      expect(errors, 'errors logged by the page').toEqual([]);
    },
    { auto: true },
  ],

  emulatedSerial: async ({ page }, use) => {
    await page.addInitScript({
      path: join(EMULATED_SERIAL_DIR, EMULATED_SERIAL_FILE),
    });

    await use({
      choosePort: (choice) =>
        page.evaluate((c) => {
          window.emulatedSerial.portChoice = c;
        }, choice),
      opens: () => page.evaluate(() => [...window.emulatedSerial.opens]),
      poke: (address, bytes) =>
        page.evaluate(
          ([a, b]) => {
            window.emulatedSerial.poke(a, b);
          },
          [address, bytes] as const,
        ),
      peek: (address, length) =>
        page.evaluate(([a, n]) => window.emulatedSerial.peek(a, n), [
          address,
          length,
        ] as const),
      setSilent: (silent) =>
        page.evaluate((s) => {
          window.emulatedSerial.setSilent(s);
        }, silent),
      unplug: () =>
        page.evaluate(() => {
          window.emulatedSerial.unplug();
        }),
    });
  },

  withoutWebSerial: async ({ page }, use) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(Navigator.prototype, 'serial');
      Reflect.deleteProperty(navigator, 'serial');
    });
    await use(undefined);
  },
});

export { expect };

/** The value shown for a name/value reading, found by its visible name. */
export function reading(page: Page, name: string): Locator {
  return page
    .getByRole('term')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .locator('xpath=following-sibling::dd[1]');
}

/**
 * Runs axe-core over the page in a real browser and fails with a readable
 * list of WCAG 2.2 AA violations. Unlike the jsdom tests, this checks colour
 * contrast, because the page is laid out and painted.
 *
 * While a Radix menu or dialog is open the rest of the page is hidden from
 * assistive tech, so pass `within` to scan only the open modal.
 */
export async function expectNoAxeViolations(
  page: Page,
  { within }: { within?: string } = {},
): Promise<void> {
  // Contrast measured mid-fade is meaningless; let open/close transitions
  // (but not endless ones, like the status pulse) finish first.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );

  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'best-practice',
  ]);
  const results = await (within ? builder.include(within) : builder).analyze();

  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} → ${violation.nodes
          .map((node) => node.target.join(' '))
          .join(', ')}`,
    ),
  ).toEqual([]);
}
