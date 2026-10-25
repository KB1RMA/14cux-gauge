// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApp } from './test-support/TestApp';
import { browserPlatform } from './platform/browser';
import type { SessionSummary } from './model/session';
import type { LiveSnapshot } from './model/snapshot';
import { MemorySessionStore } from './storage/sessionStore';
import { expectNoAxeViolations, readingFor } from './test-support/a11y';
import { connectDemo } from './test-support/demo';
import {
  START,
  collectSamples,
  recordAndStop,
  savedAndClosed,
  sessionsNav,
} from './test-support/recording';
import { notification } from './test-support/notifications';
import { fakeUsageCounter } from './test-support/usageCounter';
import { snapshotAt } from './test-support/snapshots';
import { storageWith } from './test-support/storage';

describe('Recording and browsing sessions', () => {
  it('records a session, names it, and finds it in Sessions', async () => {
    const user = userEvent.setup();
    const { container } = render(<TestApp pollIntervalMs={{ demo: 10 }} />);

    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Record' }));
    // Recording starts once its session is created in storage.
    await screen.findByRole('button', { name: 'Stop recording' });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Demo ECU · Polling · Recording',
    );
    expect(
      screen.getByRole('button', { name: 'Stop recording' }),
    ).toHaveFocus();
    expect(screen.getByText(/^\d+:\d\d recorded$/)).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await collectSamples();
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Save recording',
    });

    expect(dialog).toHaveAccessibleDescription(
      /^Recorded \d+ seconds? from the Demo ECU: [\d,]+ samples\./,
    );
    // The start time, in the user's locale.
    expect(
      (
        within(dialog).getByRole('textbox', {
          name: 'Name',
        }) as HTMLInputElement
      ).value,
    ).toMatch(/^Demo ECU, .*2\d{3}/);
    await expectNoAxeViolations(dialog);

    const name = within(dialog).getByRole('textbox', { name: 'Name' });

    await user.clear(name);
    await user.type(name, '  Idle wobble  ');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Notes' }),
      'Hunts between 600 and 900 rpm.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await savedAndClosed(dialog);

    // The same button, now offering to record again. Radix moves focus a
    // tick after the dialog has gone.
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Record' })).toHaveFocus();
    });
    expect(screen.getByRole('status')).toHaveTextContent(/Polling$/);

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));

    expect(
      sessionsNav().getByRole('link', { name: 'Sessions' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      await screen.findByRole('heading', { name: 'Recorded sessions' }),
    ).toHaveFocus();
    // jsdom has no IndexedDB, so the sessions live in memory.
    expect(
      screen.getByText(/recordings last only until the page is closed/),
    ).toBeInTheDocument();

    const item = within(screen.getByRole('listitem'));

    expect(
      item.getByRole('heading', { level: 3, name: 'Idle wobble' }),
    ).toBeInTheDocument();
    expect(
      item.getByText('Hunts between 600 and 900 rpm.'),
    ).toBeInTheDocument();
    expect(readingFor('Source')).toHaveTextContent('Demo ECU');
    expect(readingFor('Length')).toHaveTextContent(/^0:0\d$/);
    // Live polling and the status bar carry on while browsing.
    expect(screen.getByRole('status')).toHaveTextContent('Demo ECU · Polling');
    await expectNoAxeViolations(container);

    await user.click(sessionsNav().getByRole('link', { name: 'Live' }));

    expect(
      await screen.findByRole('heading', { name: 'Live data' }),
    ).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

  it('lists and marks the writes to the ECU made while recording', async () => {
    const user = userEvent.setup();
    const store = new MemorySessionStore();
    const { id } = await store.create({
      name: 'Pump check',
      source: 'serial',
      startedAt: START,
      identity: null,
    });

    await store.append(id, [
      snapshotAt(START, { engineRpm: 0, fuelPumpOn: false }),
      snapshotAt(START + 1000, { engineRpm: 0, fuelPumpOn: false }),
      snapshotAt(START + 2000, { engineRpm: 0, fuelPumpOn: true }),
      snapshotAt(START + 3000, { engineRpm: 0, fuelPumpOn: true }),
    ]);
    await store.putWrite(id, {
      id: 'clear',
      write: 'clearFaultCodes',
      startedAt: START + 400,
      endedAt: START + 700,
      outcome: {
        status: 'partial',
        message: 'Clearing may be incomplete. The ECU stopped responding.',
      },
    });
    await store.putWrite(id, {
      id: 'pump',
      write: 'fuelPump',
      startedAt: START + 1800,
      endedAt: null,
      outcome: { status: 'running' },
    });
    await store.finish(id, START + 3000);

    const { container } = render(
      <TestApp
        platform={browserPlatform({
          storage: { open: storageWith({ sessions: store }) },
        })}
      />,
    );

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Pump check' }));

    const log = within(
      await screen.findByRole('region', { name: 'Writes to the ECU' }),
    );
    const rows = log.getAllByRole('row').slice(1);

    expect(rows.map((row) => row.textContent)).toEqual([
      '0:00.4Clear fault codesPartly done. Clearing may be incomplete. The ECU stopped responding.0.3 sGo to',
      '0:01.8Fuel pump testNo end recorded. Still running when the recording stopped.Not recordedGo to',
    ]);
    await expectNoAxeViolations(container);

    await user.click(
      log.getByRole('button', { name: 'Go to Fuel pump test, 0:01.8' }),
    );

    expect(
      screen.getByRole('slider', { name: 'Playback position' }),
    ).toHaveAttribute('aria-valuetext', '1 second of 3 seconds');
    expect(readingFor('Fuel pump relay')).toHaveTextContent('Off');
    expect(
      log.getByRole('rowheader', { name: 'Fuel pump test At the playhead' }),
    ).toBeInTheDocument();
    expect(
      log.getByRole('rowheader', { name: 'Clear fault codes' }),
    ).toBeInTheDocument();
  }, 15_000);

  it('records writes to the ECU made while recording', async () => {
    const user = userEvent.setup();

    render(<TestApp pollIntervalMs={{ demo: 10 }} />);
    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Record' }));
    await collectSamples();
    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Clear fault codes',
      }),
    );
    await vi.waitFor(() => {
      expect(notification('Clear fault codes')).toHaveTextContent(
        'Fault codes cleared.',
      );
    });
    await collectSamples();
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Save recording',
    });

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await savedAndClosed(dialog);
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: /^Demo ECU, / }));

    const log = within(
      await screen.findByRole('region', { name: 'Writes to the ECU' }),
    );

    expect(
      log.getByRole('rowheader', { name: 'Clear fault codes' }),
    ).toBeInTheDocument();
    expect(log.getByText('Fault codes cleared.')).toBeInTheDocument();
    expect(log.getByText('Done.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  }, 15_000);

  it('stops recording on disconnect, and keeps the default name if skipped', async () => {
    const user = userEvent.setup();

    render(<TestApp pollIntervalMs={{ demo: 10 }} />);
    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Record' }));
    await collectSamples();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Save recording',
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(dialog).not.toBeInTheDocument();
    // The status bar went with the connection; start at the connect screen.
    // Radix moves focus a tick after the dialog has gone.
    await vi.waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Connect to an ECU' }),
      ).toHaveFocus();
    });

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));

    expect(
      await screen.findByRole('link', { name: /^Demo ECU, / }),
    ).toBeInTheDocument();
    expect(readingFor('Length')).toHaveTextContent(/^0:0\d$/);
  });

  it('shows a recording in progress, which cannot be deleted', async () => {
    const user = userEvent.setup();
    const { container } = render(<TestApp pollIntervalMs={{ demo: 10 }} />);

    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Record' }));
    await collectSamples();
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));

    await screen.findByRole('link', { name: /^Demo ECU, / });
    expect(readingFor('Length')).toHaveTextContent('Recording…');
    expect(
      screen.getByRole('button', { name: /^Delete Demo ECU, / }),
    ).toBeDisabled();

    await user.click(screen.getByRole('link', { name: /^Demo ECU, / }));

    expect(await screen.findByText(/^Still recording\./)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete session' }),
    ).toHaveAccessibleDescription(
      'Stop recording before deleting this session.',
    );
    expect(
      screen.getByRole('button', { name: 'Delete session' }),
    ).toBeDisabled();
    await expectNoAxeViolations(container);

    // Stopping from the status bar, on the sessions view.
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Save recording' }),
      ).getByRole('button', { name: 'Skip' }),
    );

    await waitFor(() => {
      expect(readingFor('Length')).toHaveTextContent(/^0:0\d$/);
    });
    expect(screen.queryByText(/^Still recording\./)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete session' }));
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: 'Delete this session?' }),
      ).getByRole('button', { name: 'Delete session' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Recorded sessions' }),
    ).toHaveFocus();
    expect(screen.getByText(/^No sessions yet\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

  it('keeps a recording under its default name when the new one cannot be saved', async () => {
    const user = userEvent.setup();

    class NoRenames extends MemorySessionStore {
      override update(): Promise<SessionSummary> {
        return Promise.reject(new DOMException('Gone', 'UnknownError'));
      }
    }

    render(
      <TestApp
        pollIntervalMs={{ demo: 10 }}
        platform={browserPlatform({
          storage: { open: storageWith({ sessions: new NoRenames() }) },
        })}
      />,
    );
    await connectDemo(user);

    const dialog = await recordAndStop(user);

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Notes' }),
      'Cold start',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The changes could not be saved. The recording is kept under its original name.',
    );
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Skip' }));
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

  it('stops recording and says so when the browser cannot save', async () => {
    const user = userEvent.setup();

    class FullStore extends MemorySessionStore {
      override append(
        _id: string,
        _samples: readonly LiveSnapshot[],
      ): Promise<void> {
        return Promise.reject(
          new DOMException('Quota exceeded', 'QuotaExceededError'),
        );
      }
    }

    const counter = fakeUsageCounter();

    render(
      <TestApp
        pollIntervalMs={{ demo: 10 }}
        platform={browserPlatform({
          storage: { open: storageWith({ sessions: new FullStore() }) },
        })}
        usageCounter={counter}
      />,
    );
    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: 'Record' }));

    // The recorder writes once a second.
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Demo ECU · Polling · Recording stopped: The browser has no room for more samples. Delete old sessions to make space.',
      );
    });
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Counted from effects, which can run after the status has rendered.
    await waitFor(() => {
      expect(counter.count.mock.calls).toEqual([
        ['connected/demo'],
        ['recording/started'],
        ['recording/failed'],
        ['recording/saved'],
      ]);
    });
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

  it('records only the chosen readings, and replays only those', async () => {
    const user = userEvent.setup();

    render(<TestApp pollIntervalMs={{ demo: 10 }} />);
    await connectDemo(user);
    await user.click(screen.getByRole('button', { name: /Choose readings/ }));
    await user.click(screen.getByRole('button', { name: 'Only Coolant' }));
    await user.keyboard('{Escape}');
    // The fuel map reads its position while shown, but that isn't recorded.
    await user.click(screen.getByRole('tab', { name: 'Fuel map' }));
    // Let the pass that was under way when the choice changed finish.
    await collectSamples();
    await recordAndStop(user);
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: /^Demo ECU, / }));
    await screen.findByRole('slider', { name: 'Playback position' });

    const terms = screen.getAllByRole('term').map((dt) => dt.textContent);

    expect(terms).toEqual(expect.arrayContaining(['Coolant', 'MIL']));
    expect(terms).not.toContain('Fuel map row');
    expect(terms).not.toContain('Fuel map column');
    expect(readingFor('Coolant')).toHaveTextContent(/^\d+ °F$/);
    expect(() => readingFor('Engine speed')).toThrow();
  });
});
