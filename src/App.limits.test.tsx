// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApp } from './test-support/TestApp';
import { readingFor } from './test-support/a11y';
import { connectDemo } from './test-support/demo';

describe('Reading limits', () => {
  it('marks a live reading on the overview once it reaches a limit the user sets', async () => {
    const user = userEvent.setup();

    render(<TestApp pollIntervalMs={{ demo: 10 }} />);
    await connectDemo(user);

    // The demo starts cold, well under coolant's suggested limits.
    await waitFor(() => {
      expect(readingFor('Coolant')).toHaveTextContent(/^-?\d+ °F$/);
    });

    await user.click(screen.getByRole('button', { name: 'Preferences' }));

    const dialog = screen.getByRole('dialog', { name: 'Preferences' });

    await user.click(within(dialog).getByRole('tab', { name: 'Limits' }));

    const coolant = within(dialog).getByRole('group', { name: 'Coolant (°F)' });

    // The ECU cannot read coolant below -13 °F, so the demo is always above.
    await user.clear(within(coolant).getByRole('textbox', { name: 'High' }));
    await user.type(
      within(coolant).getByRole('textbox', { name: 'High' }),
      '-40',
    );
    // Leaving the field applies the limit.
    await user.tab();
    await user.click(
      within(dialog).getByRole('button', { name: 'Close preferences' }),
    );

    await waitFor(() => {
      expect(readingFor('Coolant')).toHaveTextContent(/^-?\d+ °F hot$/);
    });
  });
});
