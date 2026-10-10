// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { TestApp } from './test-support/TestApp';
import { browserPlatform } from './platform/browser';
import type { SessionSummary } from './model/session';
import type { LiveSnapshot } from './model/snapshot';
import { openStorage } from './storage/openStorage';
import { MemorySessionStore } from './storage/sessionStore';
import { expectNoAxeViolations, readingFor } from './test-support/a11y';
import { notification } from './test-support/notifications';
import { fakeUsageCounter } from './test-support/usageCounter';
import { snapshotAt } from './test-support/snapshots';
import { storageWith } from './test-support/storage';
import { plantRecords } from './test-support/storedRecords';

const START = Date.UTC(2026, 9, 5, 14, 0);

/** Waits for a few polling passes; the demo's link takes ~90 ms a pass. */
async function collectSamples() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
}

async function connectDemo(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Demo mode' }));
  await screen.findByRole('heading', { name: 'Live data' });
}

async function recordAndStop(user: UserEvent) {
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
async function savedAndClosed(dialog: HTMLElement) {
  await waitFor(() => {
    expect(dialog).not.toBeInTheDocument();
  });
}

function sessionsNav() {
  return within(screen.getByRole('navigation', { name: 'Views' }));
}

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

  it('opens a session to replay, annotate and delete it', async () => {
    const user = userEvent.setup();
    const store = new MemorySessionStore();
    const { id } = await store.create({
      name: 'Idle wobble',
      source: 'demo',
      startedAt: START,
    });

    await store.append(id, [
      snapshotAt(START, { engineRpm: 820 }),
      snapshotAt(START + 1000, { engineRpm: 900 }),
      snapshotAt(START + 2000, { engineRpm: 760 }),
    ]);
    await store.finish(id, START + 2000);
    await store.update(id, { notes: 'Hunts between 600 and 900 rpm.' });

    const { container } = render(
      <TestApp
        platform={browserPlatform({
          storage: { open: storageWith({ sessions: store }) },
        })}
      />,
    );

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Idle wobble' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Idle wobble' }),
    ).toHaveFocus();
    expect(await screen.findByRole('button', { name: 'Play' })).toBeVisible();
    expect(
      screen.getByRole('slider', { name: 'Playback position' }),
    ).toHaveAttribute('aria-valuetext', '0 seconds of 2 seconds');
    expect(readingFor('Engine speed')).toHaveTextContent('820 rpm');
    expect(readingFor('Length')).toHaveTextContent('0:02');
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus();

    await user.click(screen.getByRole('radio', { name: '10×' }));

    expect(screen.getByRole('radio', { name: '10×' })).toBeChecked();
    // At ten times speed the two seconds play out, and playback stops.
    expect(
      await screen.findByRole('button', { name: 'Play' }),
    ).toBeInTheDocument();
    expect(readingFor('Engine speed')).toHaveTextContent('760 rpm');

    await user.click(screen.getByRole('tab', { name: 'Graphs' }));

    expect(
      screen.getByRole('figure', { name: 'Engine speed (rpm)' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);

    const notes = screen.getByRole('textbox', { name: 'Notes' });

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.type(notes, ' Worse when warm.');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.click(screen.getByRole('link', { name: 'All sessions' }));

    // Back on the session the user came from.
    expect(
      await screen.findByRole('link', { name: 'Idle wobble' }),
    ).toHaveFocus();
    expect(
      screen.getByText('Hunts between 600 and 900 rpm. Worse when warm.'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Delete Idle wobble' }),
    );

    const confirm = screen.getByRole('alertdialog', {
      name: 'Delete this session?',
    });

    expect(confirm).toHaveTextContent(
      '“Idle wobble” and its 3 samples will be deleted from this browser. This cannot be undone.',
    );
    await expectNoAxeViolations(confirm);
    await user.click(
      within(confirm).getByRole('button', { name: 'Delete session' }),
    );

    expect(await screen.findByText(/^No sessions yet\./)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Recorded sessions' }),
    ).toHaveFocus();
    expect(await store.list()).toEqual([]);
  });

  it('lists and marks the writes to the ECU made while recording', async () => {
    const user = userEvent.setup();
    const store = new MemorySessionStore();
    const { id } = await store.create({
      name: 'Pump check',
      source: 'serial',
      startedAt: START,
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

  it('replays a recording with the keyboard', async () => {
    const user = userEvent.setup();

    render(<TestApp pollIntervalMs={{ demo: 10 }} />);
    await connectDemo(user);
    await recordAndStop(user);
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: /^Demo ECU, / }));

    const slider = await screen.findByRole('slider', {
      name: 'Playback position',
    });
    const engineSpeed = () => readingFor('Engine speed').textContent;
    const first = engineSpeed();

    expect(slider).toHaveAttribute('aria-valuemax', '1000');

    slider.focus();
    await user.keyboard('{End}');

    // At the last sample, not just the last whole second.
    const valueText = slider.getAttribute('aria-valuetext') ?? '';
    const [at, of] = valueText.split(' of ');

    expect(at).toBe(of);
    expect(screen.getByRole('button', { name: 'Play' })).toBeVisible();

    await user.keyboard('{Home}');

    expect(slider).toHaveAttribute('aria-valuenow', '0');
    expect(engineSpeed()).toBe(first);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

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

  it('exports a session as CSV with the unit in each heading', async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    const names: string[] = [];

    URL.createObjectURL = (blob: Blob | MediaSource) => {
      blobs.push(blob as Blob);

      return 'blob:csv';
    };

    URL.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    render(<TestApp pollIntervalMs={{ demo: 10 }} />);
    await connectDemo(user);
    await recordAndStop(user);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Save recording' })).getByRole(
        'button',
        { name: 'Skip' },
      ),
    );
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: /^Demo ECU, / }));

    const exportButton = screen.getByRole('button', { name: 'Export CSV' });

    await waitFor(() => {
      expect(exportButton).toBeEnabled();
    });
    await user.click(exportButton);

    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^Demo-ECU-.*\.csv$/);

    const text = await blobs[0]?.text();

    expect(text?.split('\r\n')[0]).toMatch(
      /^Time since start \(s\),Time \(UTC\),Engine speed \(rpm\),/,
    );
    vi.restoreAllMocks();
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
  });

  it('says when a CSV export could not be saved', async () => {
    const user = userEvent.setup();

    render(
      <TestApp
        pollIntervalMs={{ demo: 10 }}
        platform={browserPlatform({
          files: { save: () => Promise.reject(new Error('Disk full')) },
        })}
      />,
    );
    await connectDemo(user);
    await recordAndStop(user);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Save recording' })).getByRole(
        'button',
        { name: 'Skip' },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: /^Demo ECU, / }));

    const exportButton = screen.getByRole('button', { name: 'Export CSV' });

    await waitFor(() => {
      expect(exportButton).toBeEnabled();
    });
    await user.click(exportButton);

    expect(
      await within(screen.getByRole('region', { name: 'Export' })).findByRole(
        'alert',
      ),
    ).toHaveTextContent(
      /^Demo-ECU-\S+\.csv could not be saved: Error: Disk full\.$/,
    );
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

  it('keeps sessions in IndexedDB across visits', async () => {
    const user = userEvent.setup();
    const factory = new IDBFactory();
    const open = () => openStorage(factory);
    const { unmount } = render(
      <TestApp
        pollIntervalMs={{ demo: 10 }}
        platform={browserPlatform({ storage: { open: open } })}
      />,
    );

    await connectDemo(user);

    const dialog = await recordAndStop(user);

    await user.clear(within(dialog).getByRole('textbox', { name: 'Name' }));
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Name' }),
      'Cold start',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await savedAndClosed(dialog);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    unmount();

    render(<TestApp platform={browserPlatform({ storage: { open: open } })} />);
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));

    expect(
      await screen.findByRole('link', { name: 'Cold start' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/recordings last only until the page is closed/),
    ).not.toBeInTheDocument();

    // Replay works without a connection.
    await user.click(screen.getByRole('link', { name: 'Cold start' }));

    expect(await screen.findByRole('button', { name: 'Play' })).toBeVisible();
    expect(readingFor('Engine speed')).toHaveTextContent(/^\d+ rpm$/);
  });

  it('says when a session has no samples, or has been deleted', async () => {
    const user = userEvent.setup();
    const factory = new IDBFactory();
    // Another tab, with its own connection to the same database.
    const otherTab = await openStorage(factory);
    const empty = await otherTab.sessions.create({
      name: 'Empty',
      source: 'serial',
      startedAt: Date.UTC(2026, 9, 5),
    });

    render(
      <TestApp
        platform={browserPlatform({
          storage: { open: () => openStorage(factory) },
        })}
      />,
    );
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Empty' }));

    expect(
      await screen.findByText('No samples were recorded in this session.'),
    ).toBeInTheDocument();
    // The page closed before this recording stopped.
    expect(readingFor('Length')).toHaveTextContent('Unfinished');
    expect(readingFor('Source')).toHaveTextContent('Serial ECU');

    // Deleted in the other tab, which this one is not told about; the next
    // change here notices.
    await act(async () => {
      await otherTab.sessions.remove(empty.id);
    });
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('The changes could not be saved.'),
    ).toBeInTheDocument();
    otherTab.close();
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

  it('says when the recorded sessions cannot be listed', async () => {
    const user = userEvent.setup();

    class NoList extends MemorySessionStore {
      override list(): Promise<SessionSummary[]> {
        return Promise.reject(new DOMException('Gone', 'UnknownError'));
      }
    }

    render(
      <TestApp
        platform={browserPlatform({
          storage: { open: storageWith({ sessions: new NoList() }) },
        })}
      />,
    );
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The recorded sessions could not be read.',
    );
  });

  it('stays where the user went while a session is being deleted', async () => {
    const user = userEvent.setup();

    let finishRemove = () => {};

    class SlowStore extends MemorySessionStore {
      override remove(id: string): Promise<void> {
        return new Promise((resolve) => {
          finishRemove = () => {
            resolve(super.remove(id));
          };
        });
      }
    }

    const store = new SlowStore();

    await store.create({
      name: 'Slow to go',
      source: 'demo',
      startedAt: START,
    });
    render(
      <TestApp
        platform={browserPlatform({
          storage: { open: storageWith({ sessions: store }) },
        })}
      />,
    );
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Slow to go' }));
    await user.click(
      await screen.findByRole('button', { name: 'Delete session' }),
    );
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: 'Delete this session?' }),
      ).getByRole('button', { name: 'Delete session' }),
    );
    await user.click(sessionsNav().getByRole('link', { name: 'Live' }));

    expect(window.location.hash).toBe('#/live');

    await act(async () => {
      finishRemove();
      await Promise.resolve();
    });

    expect(window.location.hash).toBe('#/live');
    expect(await store.list()).toEqual([]);
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

  it('shows a session that cannot be read, and deletes it', async () => {
    const user = userEvent.setup();
    const factory = new IDBFactory();
    const good = {
      id: 'good',
      name: 'Cold start',
      source: 'serial',
      startedAt: START,
      endedAt: START + 60_000,
      sampleCount: 0,
      notes: '',
      formatVersion: 3,
    };

    await plantRecords(factory, {
      sessions: [good, { ...good, id: 'newer', formatVersion: 4 }],
    });

    const { container } = render(
      <TestApp
        platform={browserPlatform({
          storage: { open: () => openStorage(factory) },
        })}
      />,
    );

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));

    const row = (
      await screen.findByRole('heading', { name: 'Session that can’t be read' })
    ).closest('li');

    expect(row).toHaveTextContent(
      'format 4 is from a newer version of the app. Its ID is newer.',
    );
    expect(screen.getByRole('link', { name: 'Cold start' })).toBeVisible();
    await expectNoAxeViolations(container);

    await user.click(
      screen.getByRole('button', {
        name: 'Delete session that can’t be read, newer',
      }),
    );

    const confirm = screen.getByRole('alertdialog', {
      name: 'Delete this session?',
    });

    expect(confirm).toHaveTextContent(
      'This session, which cannot be read, and its samples will be deleted from this browser.',
    );
    await user.click(
      within(confirm).getByRole('button', { name: 'Delete session' }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Session that can’t be read' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Cold start' })).toBeVisible();
  });
});
