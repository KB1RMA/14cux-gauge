// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { expectNoAxeViolations } from './test-support/a11y';
import { fakeUsageCounter as fakeCounter } from './test-support/usageCounter';

function setGlobalPrivacyControl(value: boolean | undefined): void {
  Object.defineProperty(navigator, 'globalPrivacyControl', {
    value,
    configurable: true,
  });
}

describe('App usage counts', () => {
  afterEach(() => {
    setGlobalPrivacyControl(undefined);
  });

  it('counts the visit and each connection, by kind only', async () => {
    const user = userEvent.setup();
    const counter = fakeCounter();

    render(<App pollIntervalMs={{ demo: 10 }} usageCounter={counter} />);

    expect(counter.start).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Demo mode' }));
    await screen.findByRole('heading', { name: 'Live data' });

    expect(counter.count).toHaveBeenCalledExactlyOnceWith('connected/demo');

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(await screen.findByRole('button', { name: 'Demo mode' }));
    await screen.findByRole('heading', { name: 'Live data' });

    expect(counter.count.mock.calls).toEqual([
      ['connected/demo'],
      ['connected/demo'],
    ]);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

  it('counts a recording started and saved, but not its name or notes', async () => {
    const user = userEvent.setup();
    const counter = fakeCounter();

    render(<App pollIntervalMs={{ demo: 10 }} usageCounter={counter} />);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));
    await screen.findByRole('heading', { name: 'Live data' });
    await user.click(screen.getByRole('button', { name: 'Record' }));
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Save recording',
    });

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Notes' }),
      'Private notes',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });

    expect(counter.count.mock.calls).toEqual([
      ['connected/demo'],
      ['recording/started'],
      ['recording/saved'],
    ]);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

  it('says so in the footer, and lets the user turn counting off', async () => {
    const user = userEvent.setup();
    const counter = fakeCounter();
    const { container, unmount } = render(<App usageCounter={counter} />);

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Visits and basic usage are counted anonymously with GoatCounter (opens in a new tab), without cookies.',
    );
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'Preferences' }));
    await user.click(
      screen.getByRole('menuitemradio', { name: 'Don’t count my visits' }),
    );
    await user.keyboard('{Escape}');
    unmount();
    counter.start.mockClear();

    render(<App pollIntervalMs={{ demo: 10 }} usageCounter={counter} />);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));
    await screen.findByRole('heading', { name: 'Live data' });

    expect(counter.start).not.toHaveBeenCalled();
    expect(counter.count).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

  it('starts off when the browser asks not to be tracked, until the user opts in', async () => {
    const user = userEvent.setup();
    const counter = fakeCounter();

    setGlobalPrivacyControl(true);
    render(<App usageCounter={counter} />);

    expect(counter.start).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Preferences' }));

    expect(
      screen.getByRole('menuitemradio', { name: 'Don’t count my visits' }),
    ).toBeChecked();

    await user.click(
      screen.getByRole('menuitemradio', {
        name: 'Count my visits anonymously',
      }),
    );

    expect(counter.start).toHaveBeenCalled();
  });

  it('neither offers nor mentions counting where it does not count', async () => {
    const user = userEvent.setup();

    render(<App usageCounter={undefined} />);

    expect(screen.getByRole('contentinfo')).not.toHaveTextContent(
      'GoatCounter',
    );

    await user.click(screen.getByRole('button', { name: 'Preferences' }));

    expect(
      screen.queryByRole('menuitemradio', {
        name: 'Count my visits anonymously',
      }),
    ).not.toBeInTheDocument();
  });
});
