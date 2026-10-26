// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

export const START = Date.UTC(2026, 9, 5, 14, 0);

/** Waits for a few polling passes; the demo's link takes ~90 ms a pass. */
export async function collectSamples() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
}

export async function recordAndStop(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Record' }));
  await collectSamples();
  // Recording starts once the store has created the session, which
  // IndexedDB may take a while to do on a busy machine.
  await user.click(
    await screen.findByRole('button', { name: 'Stop recording' }),
  );

  return screen.findByRole('dialog', { name: 'Save recording' });
}

/**
 * Waits for the save dialog to close. It closes once the store has written
 * the name and notes, which IndexedDB does on a later tick; until then it
 * hides the rest of the page from queries by role.
 */
export async function savedAndClosed(dialog: HTMLElement) {
  await waitFor(() => {
    expect(dialog).not.toBeInTheDocument();
  });
}

export function sessionsNav() {
  return within(screen.getByRole('navigation', { name: 'Views' }));
}

/** The table of recorded sessions. */
export function sessionsTable() {
  return screen.getByRole('table', { name: 'Recorded sessions' });
}

/** The row of the session named `name` in the sessions table. */
export function sessionRow(name: string | RegExp): HTMLTableRowElement {
  const row = within(sessionsTable())
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByRole('link', { name }));

  if (!(row instanceof HTMLTableRowElement)) {
    throw new Error(`No session named ${String(name)} in the table`);
  }

  return row;
}

/** What the sessions table shows for session `name` under heading `column`. */
export function sessionCell(name: string | RegExp, column: string) {
  const heading = within(sessionsTable()).getByRole('columnheader', {
    name: column,
  });
  const cell =
    sessionRow(name).cells[(heading as HTMLTableCellElement).cellIndex];

  if (!cell) {
    throw new Error(`No ${column} for session ${String(name)}`);
  }

  return cell;
}
