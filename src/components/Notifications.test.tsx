// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { NotificationInput } from '../notifications/context';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { useNotify } from '../notifications/useNotify';
import { expectNoAxeViolations } from '../test-support/a11y';
import {
  notification,
  notificationsRegion,
} from '../test-support/notifications';

const RUNNING: NotificationInput = {
  key: 'pump',
  tone: 'progress',
  title: 'Fuel pump test',
  message: 'Fuel pump running',
};
const STOPPED: NotificationInput = {
  ...RUNNING,
  tone: 'success',
  message: 'Fuel pump stopped.',
};
const FAILED: NotificationInput = {
  key: 'faults',
  tone: 'error',
  title: 'Clear fault codes',
  message: 'The fault codes were not cleared.',
};

function Trigger({ input }: { input: NotificationInput }) {
  const notify = useNotify();

  return (
    <button
      type="button"
      onClick={() => {
        notify(input);
      }}
    >
      {`${input.tone}: ${input.message}`}
    </button>
  );
}

function renderNotifications() {
  render(
    <NotificationsProvider>
      <main>
        {[RUNNING, STOPPED, FAILED].map((input) => (
          <Trigger key={`${input.key}-${input.tone}`} input={input} />
        ))}
      </main>
    </NotificationsProvider>,
  );
}

function send(input: NotificationInput) {
  fireEvent.click(
    screen.getByRole('button', { name: `${input.tone}: ${input.message}` }),
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('Notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('must be used inside its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Trigger input={RUNNING} />)).toThrow(
      'useNotify must be used inside <NotificationsProvider>',
    );
  });

  it('keeps progress up until it is replaced, then lets a success close itself', async () => {
    renderNotifications();
    send(RUNNING);
    await advance(60_000);

    expect(notification('Fuel pump test')).toHaveTextContent(
      'Fuel pump running',
    );

    send(STOPPED);
    await advance(0);

    expect(notification('Fuel pump test')).toHaveTextContent(
      'Fuel pump stopped.',
    );

    await advance(7900);

    expect(notification('Fuel pump test')).toBeDefined();

    await advance(200);

    expect(notification('Fuel pump test')).toBeUndefined();
  });

  it('keeps an error until it is dismissed, beside others', async () => {
    renderNotifications();
    send(FAILED);
    send(RUNNING);
    await advance(60_000);

    expect(notification('Clear fault codes')).toHaveTextContent(
      'The fault codes were not cleared.',
    );
    expect(notification('Fuel pump test')).toBeDefined();
    // axe waits on real timers; neither notification closes itself.
    vi.useRealTimers();
    await expectNoAxeViolations(document.body);

    const close = screen.getAllByRole('button', { name: 'Dismiss' })[0];

    if (!close) {
      throw new Error('No Dismiss button');
    }

    fireEvent.click(close);

    expect(notification('Clear fault codes')).toBeUndefined();
    expect(notification('Fuel pump test')).toBeDefined();
  });

  it('shows nothing, and blocks nothing, until there is something to say', () => {
    renderNotifications();

    expect(notificationsRegion()).not.toHaveTextContent(/./);
  });
});
