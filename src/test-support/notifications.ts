// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { screen, within } from '@testing-library/react';

/** The app's notifications, as Radix Toast labels them. */
export function notificationsRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Notifications (F8)' });
}

/**
 * The open notification titled `title`, or `undefined` if none is showing.
 * Fails if more than one is.
 */
export function notification(title: string): HTMLElement | undefined {
  const matches = within(notificationsRegion())
    .queryAllByRole('listitem')
    .filter((item) => within(item).queryByText(title, { exact: true }));

  if (matches.length > 1) {
    throw new Error(`${String(matches.length)} notifications for ${title}`);
  }

  return matches[0];
}
