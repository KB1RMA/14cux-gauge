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

/** GoatCounter's script and counter hosts. */
export const USAGE_COUNTER_HOSTS =
  /^https:\/\/(gc\.zgo\.at|[^/]+\.goatcounter\.com)\//;

interface Fixtures {
  /** Fails the test if the page logs an error or throws. Always on. */
  pageErrors: undefined;
  /**
   * Keeps test runs out of the project's usage counts, should a build ever
   * try to count from the test server. Always on.
   */
  noUsageCounts: undefined;
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

  noUsageCounts: [
    async ({ page }, use) => {
      await page.route(USAGE_COUNTER_HOSTS, (route) => route.abort());
      await use(undefined);
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
  const exactName = new RegExp(
    `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  );

  // A <dd> is tied to its <dt> by position only; no role expresses that.
  // eslint-disable-next-line playwright/no-raw-locators -- see above
  return page
    .getByRole('term')
    .filter({ hasText: exactName })
    .locator('xpath=following-sibling::dd[1]');
}

/**
 * The key that moves focus to the next control. Safari's Tab skips buttons
 * unless the user turns on "Press Tab to highlight each item"; Option-Tab
 * always reaches them.
 */
export function tabKey(browserName: string): string {
  return browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
}

/**
 * Presses `key` from wherever focus is until `target` has focus, as a
 * keyboard user would. Gives up after `limit` presses; assert focus after.
 */
export async function tabTo(
  page: Page,
  target: Locator,
  key: string,
  limit = 20,
): Promise<void> {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(key);

    if (await target.evaluate((el) => el === document.activeElement)) {
      return;
    }
  }
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
  // (but not endless ones, like the status pulse) finish first. allSettled,
  // because `finished` rejects when an animation is cancelled, as when Radix
  // unmounts content mid-fade.
  await page.evaluate(() =>
    Promise.allSettled(
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
