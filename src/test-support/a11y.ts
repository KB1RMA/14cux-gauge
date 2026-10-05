// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { screen } from '@testing-library/react';
import axe from 'axe-core';

/**
 * Runs axe-core over rendered output and fails with a readable list of any
 * WCAG violations.
 *
 * Colour contrast is not checked: jsdom neither lays out nor paints, so axe
 * cannot measure it. The theme's colour pairs are checked when chosen (see
 * `src/styles/theme.css`).
 */
export async function expectNoAxeViolations(context: Element): Promise<void> {
  const results = await axe.run(context, {
    runOnly: {
      type: 'tag',
      values: [
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag21aa',
        'wcag22aa',
        'best-practice',
      ],
    },
    rules: {
      'color-contrast': { enabled: false },
      // Landmark coverage is a whole-page property; components rendered on
      // their own are not inside the app's <main>.
      region: { enabled: false },
    },
  });

  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} → ${violation.nodes
          .map((node) => node.target.join(' '))
          .join(', ')}`,
    ),
  ).toEqual([]);
}

/** The value shown for a dashboard reading, found by its visible label. */
export function readingFor(label: string): HTMLElement {
  const term = screen
    .getAllByRole('term')
    .find((element) => element.textContent === label);
  const value = term?.nextElementSibling;

  if (!(value instanceof HTMLElement) || value.tagName !== 'DD') {
    throw new Error(`No reading labelled "${label}"`);
  }

  return value;
}
