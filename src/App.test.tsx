// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { expectNoAxeViolations, readingFor } from './test-support/a11y';

describe('App in demo mode', () => {
  it('connects to the demo ECU, polls live data, and disconnects', async () => {
    const user = userEvent.setup();
    const { container } = render(<App pollIntervalMs={{ demo: 10 }} />);

    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));

    const heading = await screen.findByRole('heading', { name: 'Live data' });

    expect(heading).toHaveFocus();
    await vi.waitFor(() => {
      expect(readingFor('Engine speed')).toHaveTextContent(/\d+ rpm/);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Demo ECU · Polling');
    expect(
      await screen.findByText('1234', { selector: 'dd' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Read fault codes' }));

    const faults = await screen.findByRole('list', {
      name: 'Stored fault codes',
    });

    expect(within(faults).getByText(/Purge valve leak/)).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(readingFor('MIL')).toHaveTextContent('On');
    });
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));
    await expectNoAxeViolations(container);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(
      await screen.findByRole('heading', { name: 'Connect to an ECU' }),
    ).toHaveFocus();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the sample rate out of the live region', async () => {
    const user = userEvent.setup();

    render(<App pollIntervalMs={{ demo: 10 }} />);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));

    const region = await screen.findByRole('region', { name: 'Connection' });

    await vi.waitFor(() => {
      expect(region).toHaveTextContent(/samples\/s/);
    });
    expect(screen.getByRole('status')).not.toHaveTextContent(/samples/);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

  it('switches between the overview and live graphs, and remembers the view', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(
      <App pollIntervalMs={{ demo: 10 }} />,
    );

    await user.click(screen.getByRole('button', { name: 'Demo mode' }));

    const tabs = await screen.findByRole('tablist', {
      name: 'Dashboard views',
    });

    expect(within(tabs).getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(within(tabs).getByRole('tab', { name: 'Graphs' }));

    expect(
      screen.getByRole('tabpanel', { name: 'Graphs' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Live data' }),
    ).not.toBeInTheDocument();

    const rpm = screen.getByRole('figure', { name: 'Engine speed (rpm)' });

    // The demo's samples reach the graph's text summary.
    await vi.waitFor(() => {
      expect(
        within(rpm)
          .getAllByRole('definition')
          .map((dd) => dd.textContent),
      ).toContainEqual(expect.stringMatching(/^\d+ rpm$/));
    });
    await expectNoAxeViolations(container);

    // Arrow keys move between tabs, as in any tab list.
    within(tabs).getByRole('tab', { name: 'Graphs' }).focus();
    await user.keyboard('{ArrowLeft}');

    expect(
      await screen.findByRole('heading', { name: 'Live data' }),
    ).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    unmount();

    render(<App pollIntervalMs={{ demo: 10 }} />);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));

    expect(
      await screen.findByRole('heading', { name: 'Live graphs' }),
    ).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });
});
