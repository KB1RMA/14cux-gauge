// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApp } from './test-support/TestApp';

/** Back and Forward are asynchronous in jsdom; wait for the address to settle. */
async function goBack() {
  act(() => {
    window.history.back();
  });
}

describe('Addresses', () => {
  it('starts on the live view and redirects an unknown address there', () => {
    window.location.hash = '#/nowhere/at/all';
    render(<TestApp />);

    expect(window.location.hash).toBe('#/live');
    expect(screen.getByRole('link', { name: 'Live' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens a session address directly', async () => {
    window.location.hash = '#/sessions/missing-id';
    render(<TestApp />);

    expect(
      await screen.findByText('This session has been deleted.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sessions' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('gives each view its own address, and Back and Forward move between them', async () => {
    const user = userEvent.setup();

    render(<TestApp pollIntervalMs={{ demo: 10 }} />);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));
    await screen.findByRole('heading', { name: 'Live data' });

    const tabs = screen.getByRole('tablist', { name: 'Dashboard views' });

    await user.click(within(tabs).getByRole('tab', { name: 'Graphs' }));
    expect(window.location.hash).toBe('#/live/graphs');
    await user.click(within(tabs).getByRole('tab', { name: 'Fuel map' }));
    expect(window.location.hash).toBe('#/live/fuel-map');
    await user.click(screen.getByRole('link', { name: 'Sessions' }));
    expect(window.location.hash).toBe('#/sessions');

    await goBack();
    await waitFor(() => {
      expect(window.location.hash).toBe('#/live/fuel-map');
    });
    expect(
      await screen.findByRole('tab', { name: 'Fuel map', selected: true }),
    ).toBeInTheDocument();

    await goBack();
    expect(
      await screen.findByRole('tab', { name: 'Graphs', selected: true }),
    ).toBeInTheDocument();

    act(() => {
      window.history.forward();
    });
    expect(
      await screen.findByRole('tab', { name: 'Fuel map', selected: true }),
    ).toBeInTheDocument();
  });

  it('adds one history entry when a tab reports itself twice before the view updates', async () => {
    const user = userEvent.setup();

    render(<TestApp pollIntervalMs={{ demo: 10 }} />);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));
    await screen.findByRole('heading', { name: 'Live data' });

    const tabs = screen.getByRole('tablist', { name: 'Dashboard views' });
    const graphs = within(tabs).getByRole('tab', { name: 'Graphs' });

    // Pressing a tab reports it on mouse down and again as it takes focus,
    // and both can arrive before React re-renders.
    act(() => {
      fireEvent.mouseDown(graphs, { button: 0, ctrlKey: false });
      fireEvent.focus(graphs);
    });
    expect(window.location.hash).toBe('#/live/graphs');

    await goBack();
    await waitFor(() => {
      expect(window.location.hash).toBe('#/live');
    });
  });

  it('opens the session list at its address and the live view from the nav', async () => {
    const user = userEvent.setup();

    window.location.hash = '#/sessions';
    render(<TestApp />);

    expect(
      await screen.findByRole('heading', { name: 'Recorded sessions' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Live' }));
    expect(window.location.hash).toBe('#/live');
  });
});
