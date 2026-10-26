// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { TestApp } from './test-support/TestApp';
import {
  broadcastChannels,
  browserApp,
  browserPlatform,
} from './platform/browser';
import type { SessionSummary } from './model/session';
import { openStorage } from './storage/openStorage';
import { MemorySessionStore } from './storage/sessionStore';
import { expectNoAxeViolations, readingFor } from './test-support/a11y';
import { connectDemo } from './test-support/demo';
import {
  START,
  recordAndStop,
  savedAndClosed,
  sessionsNav,
} from './test-support/recording';
import { IDENTITY } from './test-support/identity';
import { snapshotAt } from './test-support/snapshots';
import { noFileChosen } from './test-support/platform';
import { storageWith } from './test-support/storage';
import { plantRecords } from './test-support/storedRecords';

describe('Recording and browsing sessions', () => {
  it('opens a session to replay, annotate and delete it', async () => {
    const user = userEvent.setup();
    const store = new MemorySessionStore();
    const { id } = await store.create({
      name: 'Idle wobble',
      source: 'demo',
      startedAt: START,
      identity: null,
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

  it('shows the ECU’s identity and fault codes from the start of a session', async () => {
    const user = userEvent.setup();
    const store = new MemorySessionStore();
    const { id } = await store.create({
      name: 'Misfire hunt',
      source: 'serial',
      startedAt: START,
      identity: {
        ...IDENTITY,
        faultCodes: {
          status: 'read',
          readAt: START,
          value: {
            romChecksumFailure: true,
            coolantTempSensor: true,
            futureFault: true,
          },
        },
        fuelMap: { status: 'invalid', readAt: START },
        rpmLimit: {
          status: 'failed',
          readAt: START,
          message: 'The ECU stopped responding.',
        },
      },
    });

    await store.finish(id, START + 1000);

    const { container } = render(
      <TestApp
        platform={browserPlatform({
          storage: { open: storageWith({ sessions: store }) },
        })}
      />,
    );

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Misfire hunt' }));

    const identity = await screen.findByRole('region', {
      name: 'ECU at the start',
    });

    expect(readingFor('Tune number')).toHaveTextContent(/^3360 read /);
    expect(readingFor('Tune ident')).toHaveTextContent(/^0x0021 read /);
    expect(readingFor('Checksum fixer')).toHaveTextContent(/^0x5C read /);
    expect(readingFor('Rev limit')).toHaveTextContent(
      /^Not read: The ECU stopped responding\. read /,
    );
    expect(readingFor('Fuel map')).toHaveTextContent(/^Not valid read /);
    expect(
      within(identity)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      '29 · ROM checksum failure romChecksumFailure',
      '14 · Coolant temperature sensor coolantTempSensor',
      'Unknown fault code futureFault',
    ]);
    expect(within(identity).queryByText(/Simulated/)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('marks a demo session’s identity as simulated', async () => {
    const user = userEvent.setup();
    const store = new MemorySessionStore();
    const { id } = await store.create({
      name: 'Demo drive',
      source: 'demo',
      startedAt: START,
      identity: {
        ...IDENTITY,
        faultCodes: { status: 'read', readAt: START, value: {} },
      },
    });

    await store.finish(id, START + 1000);
    render(
      <TestApp
        platform={browserPlatform({
          storage: { open: storageWith({ sessions: store }) },
        })}
      />,
    );

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Demo drive' }));

    const identity = await screen.findByRole('region', {
      name: 'ECU at the start',
    });

    expect(identity).toHaveTextContent(
      'Simulated: recorded from the demo ECU, not a real one.',
    );
    expect(identity).toHaveTextContent('No fault codes stored.');
  });

  it('says when the fault codes at the start could not be read', async () => {
    const user = userEvent.setup();
    const store = new MemorySessionStore();
    const { id } = await store.create({
      name: 'Lost link',
      source: 'serial',
      startedAt: START,
      identity: {
        ...IDENTITY,
        faultCodes: {
          status: 'failed',
          readAt: START,
          message: 'The connection to the ECU was closed.',
        },
      },
    });

    await store.finish(id, START + 1000);
    render(
      <TestApp
        platform={browserPlatform({
          storage: { open: storageWith({ sessions: store }) },
        })}
      />,
    );

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Lost link' }));

    const identity = await screen.findByRole('region', {
      name: 'ECU at the start',
    });

    expect(identity).toHaveTextContent(
      'Not read: The connection to the ECU was closed.',
    );
    expect(within(identity).queryByRole('list')).not.toBeInTheDocument();
  });

  it('opens a session recorded before identities were kept, and says so', async () => {
    const user = userEvent.setup();
    const factory = new IDBFactory();

    await plantRecords(factory, {
      sessions: [
        {
          id: 'old',
          name: 'Old drive',
          source: 'serial',
          startedAt: START,
          endedAt: START + 60_000,
          sampleCount: 1,
          notes: '',
          formatVersion: 3,
        },
      ],
      chunks: [{ sessionId: 'old', samples: [snapshotAt(START)] }],
    });

    const { container } = render(
      <TestApp
        platform={browserPlatform({
          storage: { open: () => openStorage(factory) },
        })}
      />,
    );

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Old drive' }));

    const identity = await screen.findByRole('region', {
      name: 'ECU at the start',
    });

    expect(identity).toHaveTextContent(
      'Not recorded. This session was recorded before the app kept the ECU’s identity and fault codes.',
    );
    expect(() => readingFor('Tune number')).toThrow();
    expect(await screen.findByRole('button', { name: 'Play' })).toBeVisible();
    await expectNoAxeViolations(container);
  });

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

    const lines = text?.split('\r\n') ?? [];
    // The identity rows end at a line of empty fields.
    const blank = lines.findIndex((line) => /^,*$/.test(line));

    // The demo ECU's synthetic tune, rev limit, fuel map and stored fault:
    // each row's label and value, without its read time or padding.
    expect(
      lines
        .slice(0, blank)
        .map((line) => line.split(',').slice(0, 2).join(',')),
    ).toEqual([
      'ECU at start of recording,Value',
      'Source,Demo ECU (simulated)',
      'Tune number,1234',
      'Tune ident,0xDE70',
      'Checksum fixer,0xA5',
      'Rev limit (rpm),5000',
      'Fuel map,5',
      'Fault code,88 Purge valve leak (purgeValveLeak)',
    ]);
    expect(lines[blank + 1]).toMatch(
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
          files: {
            save: () => Promise.reject(new Error('Disk full')),
            open: noFileChosen,
          },
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
      identity: null,
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
      identity: null,
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
      sessions: [good, { ...good, id: 'newer', formatVersion: 6 }],
    });

    const { container } = render(
      <TestApp
        platform={browserPlatform({
          storage: { open: () => openStorage(factory) },
        })}
      />,
    );

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));

    const unreadable = await screen.findByRole('region', {
      name: 'Sessions that can’t be read',
    });

    expect(within(unreadable).getByRole('listitem')).toHaveTextContent(
      'format 6 is from a newer version of the app. Its ID is newer.',
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
        screen.queryByRole('region', { name: 'Sessions that can’t be read' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Cold start' })).toBeVisible();
  });
  it('shows a session saved in another window, and says when another window took the storage', async () => {
    const user = userEvent.setup();
    const factory = new IDBFactory();
    const otherWindow = await openStorage(factory, broadcastChannels);
    const reload = vi.fn();

    onTestFinished(() => {
      otherWindow.close();
    });
    const { container } = render(
      <TestApp
        platform={browserPlatform({
          storage: { open: () => openStorage(factory, broadcastChannels) },
          app: { ...browserApp, reload },
        })}
      />,
    );
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    expect(await screen.findByText(/^No sessions yet\./)).toBeInTheDocument();

    await otherWindow.sessions.create({
      name: 'From elsewhere',
      source: 'serial',
      startedAt: Date.UTC(2026, 9, 5),
      identity: null,
    });

    expect(
      await screen.findByRole('link', { name: 'From elsewhere' }),
    ).toBeVisible();

    // Another window upgrades the database: this one must say so.
    await new Promise<void>((resolve, reject) => {
      const req = factory.open('cuxGauge', 99);

      req.onsuccess = () => {
        req.result.close();
        resolve();
      };

      req.onerror = () => {
        reject(req.error ?? new Error('upgrade failed'));
      };
    });

    expect(
      await screen.findByText(/Saved sessions and ROM images are unavailable/),
    ).toBeVisible();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('asks before reloading for storage while connected, as that ends the connection', async () => {
    const user = userEvent.setup();
    const factory = new IDBFactory();
    const reload = vi.fn();

    render(
      <TestApp
        pollIntervalMs={{ demo: 10 }}
        platform={browserPlatform({
          storage: { open: () => openStorage(factory) },
          app: { ...browserApp, reload },
        })}
      />,
    );
    await connectDemo(user);
    await new Promise<void>((resolve, reject) => {
      const req = factory.open('cuxGauge', 99);

      req.onsuccess = () => {
        req.result.close();
        resolve();
      };

      req.onerror = () => {
        reject(req.error ?? new Error('upgrade failed'));
      };
    });
    await user.click(await screen.findByRole('button', { name: 'Reload' }));

    const dialog = screen.getByRole('alertdialog', {
      name: 'Reload the page?',
    });

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(reload).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: 'Reload the page?' }),
      ).getByRole('button', { name: 'Reload and disconnect' }),
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
