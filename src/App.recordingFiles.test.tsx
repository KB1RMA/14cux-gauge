// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApp } from './test-support/TestApp';
import type { FilePlatform, OpenedFile } from './platform/platform';
import { MemorySessionStore, type SessionStore } from './storage/sessionStore';
import type { ImportedSession, SessionSummary } from './model/session';
import { expectNoAxeViolations } from './test-support/a11y';
import { testPlatform } from './test-support/platform';
import {
  START,
  sessionCell,
  sessionRow,
  sessionsNav,
  sessionsTable,
} from './test-support/recording';
import { snapshotAt } from './test-support/snapshots';
import { storageWith } from './test-support/storage';

interface SavedFile {
  name: string;
  data: string | Uint8Array;
  type: string;
}

/**
 * The app over `store`, keeping every file it saves, and opening the files
 * in `toOpen` in turn (then nothing, as if the dialog were dismissed).
 */
function renderApp(
  store: SessionStore,
  toOpen: OpenedFile[] = [],
  files: Partial<FilePlatform> = {},
) {
  const saved: SavedFile[] = [];
  const { container } = render(
    <TestApp
      platform={testPlatform({
        storage: { open: storageWith({ sessions: store }) },
        files: {
          save: (name, data, type) => {
            saved.push({ name, data, type });

            return Promise.resolve('saved');
          },
          open: () => Promise.resolve(toOpen.shift() ?? 'cancelled'),
          ...files,
        },
      })}
    />,
  );

  return { container, saved };
}

async function twoSessions() {
  const store = new MemorySessionStore();
  const idle = await store.create({
    name: 'Idle wobble',
    source: 'serial',
    startedAt: START,
    identity: null,
  });

  await store.append(idle.id, [
    snapshotAt(START, { engineRpm: 812.5 }),
    snapshotAt(START + 1000, { engineRpm: 790.25 }),
  ]);
  await store.finish(idle.id, START + 65_000);
  await store.update(idle.id, { notes: 'Hunts when warm.' });

  const cold = await store.create({
    name: 'Cold start',
    source: 'demo',
    startedAt: START + 3_600_000,
    identity: null,
  });

  await store.append(cold.id, [snapshotAt(START + 3_600_000)]);
  await store.finish(cold.id, START + 3_605_000);

  return store;
}

/** The session names down the table, top to bottom. */
function namesInOrder() {
  return within(sessionsTable())
    .getAllByRole('rowheader')
    .map((header) => within(header).getByRole('link').textContent);
}

describe('The sessions table', () => {
  it('lists each session with its details, newest first, and sorts by any column', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(await twoSessions());

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await screen.findByRole('link', { name: 'Idle wobble' });

    expect(namesInOrder()).toEqual(['Cold start', 'Idle wobble']);
    expect(
      within(sessionsTable()).getByRole('columnheader', { name: 'Recorded' }),
    ).toHaveAttribute('aria-sort', 'descending');
    expect(sessionCell('Idle wobble', 'Length')).toHaveTextContent('1:05');
    expect(sessionCell('Idle wobble', 'Samples')).toHaveTextContent('2');
    expect(sessionCell('Idle wobble', 'Source')).toHaveTextContent(
      'Serial ECU',
    );
    expect(sessionCell('Cold start', 'Length')).toHaveTextContent('0:05');
    expect(sessionCell('Cold start', 'Source')).toHaveTextContent('Demo ECU');
    expect(
      within(sessionRow('Idle wobble')).getByText('Hunts when warm.'),
    ).toBeVisible();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'Name' }));

    expect(
      within(sessionsTable()).getByRole('columnheader', { name: 'Name' }),
    ).toHaveAttribute('aria-sort', 'ascending');
    expect(namesInOrder()).toEqual(['Cold start', 'Idle wobble']);

    await user.click(screen.getByRole('button', { name: 'Name' }));

    expect(namesInOrder()).toEqual(['Idle wobble', 'Cold start']);

    // Longest first, the more useful way round for a length.
    await user.click(screen.getByRole('button', { name: 'Length' }));

    expect(
      within(sessionsTable()).getByRole('columnheader', { name: 'Length' }),
    ).toHaveAttribute('aria-sort', 'descending');
    expect(
      within(sessionsTable()).getByRole('columnheader', { name: 'Name' }),
    ).not.toHaveAttribute('aria-sort');
    expect(namesInOrder()).toEqual(['Idle wobble', 'Cold start']);
  });

  it('sorts by samples and source, with unfinished sessions last by length', async () => {
    const user = userEvent.setup();
    const store = await twoSessions();
    const { id } = await store.create({
      name: 'Cut short',
      source: 'serial',
      startedAt: START + 7_200_000,
      identity: null,
    });

    await store.append(id, [
      snapshotAt(START + 7_200_000),
      snapshotAt(START + 7_200_100),
      snapshotAt(START + 7_200_200),
    ]);
    renderApp(store);

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await screen.findByRole('link', { name: 'Cut short' });

    expect(sessionCell('Cut short', 'Length')).toHaveTextContent('Unfinished');

    await user.click(screen.getByRole('button', { name: 'Length' }));

    expect(namesInOrder()).toEqual(['Idle wobble', 'Cold start', 'Cut short']);

    await user.click(screen.getByRole('button', { name: 'Length' }));

    expect(namesInOrder()).toEqual(['Cold start', 'Idle wobble', 'Cut short']);

    // Most samples first.
    await user.click(screen.getByRole('button', { name: 'Samples' }));

    expect(namesInOrder()).toEqual(['Cut short', 'Idle wobble', 'Cold start']);

    await user.click(screen.getByRole('button', { name: 'Source' }));

    expect(namesInOrder().slice(0, 1)).toEqual(['Cold start']);
    expect(sessionCell('Cold start', 'Source')).toHaveTextContent('Demo ECU');
  });

  it('saves the chosen sessions together in one recording file', async () => {
    const user = userEvent.setup();
    const toOpen: OpenedFile[] = [];
    const { container, saved } = renderApp(await twoSessions(), toOpen);

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await screen.findByRole('link', { name: 'Idle wobble' });

    // The file actions share one toolbar along the top of the table.
    const toolbar = within(screen.getByRole('toolbar', { name: 'Sessions' }));
    const save = toolbar.getByRole('button', { name: 'Save selected as file' });

    expect(
      toolbar.getByRole('button', { name: 'Open recording file…' }),
    ).toBeEnabled();
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription(
      'Choose sessions to save them together.',
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'Select Idle wobble' }),
    );

    expect(
      screen.getByRole('checkbox', { name: 'Select all sessions' }),
    ).toBePartiallyChecked();
    expect(save).toHaveAccessibleDescription('1 of 2 selected.');
    await expectNoAxeViolations(container);

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all sessions' }),
    );

    expect(
      screen.getByRole('checkbox', { name: 'Select Cold start' }),
    ).toBeChecked();
    expect(save).toHaveAccessibleDescription('2 of 2 selected.');

    await user.click(save);

    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toMatch(/^14CUX-recordings-\d{4}-\d\d-\d\dT/);
    expect(saved[0]?.type).toBe('application/json');

    const file = JSON.parse(String(saved[0]?.data)) as {
      kind: string;
      version: number;
      recordings: { name: string; samples: { engineRpm?: number }[] }[];
    };

    expect(file.kind).toBe('14cux-gauge-recordings');
    expect(file.version).toBe(1);
    expect(file.recordings.map(({ name }) => name)).toEqual([
      'Cold start',
      'Idle wobble',
    ]);
    expect(
      file.recordings[1]?.samples.map(({ engineRpm }) => engineRpm),
    ).toEqual([812.5, 790.25]);

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all sessions' }),
    );

    expect(save).toBeDisabled();

    // Opened again, both come back as copies.
    toOpen.push({ name: 'both.json', text: String(saved[0]?.data) });
    await user.click(
      screen.getByRole('button', { name: 'Open recording file…' }),
    );

    expect(
      await within(
        screen.getByRole('region', { name: 'Recorded sessions' }),
      ).findByText(/^Opened /),
    ).toHaveTextContent('Opened 2 recordings from both.json.');
    expect(within(sessionsTable()).getAllByRole('rowheader')).toHaveLength(4);
  });

  it('opens a saved recording file, and shows where the session came from', async () => {
    const user = userEvent.setup();
    const toOpen: OpenedFile[] = [];
    const { container, saved } = renderApp(await twoSessions(), toOpen);

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Idle wobble' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Save selected as file' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Delete Idle wobble' }),
    );
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: 'Delete this session?' }),
      ).getByRole('button', { name: 'Delete session' }),
    );

    expect(namesInOrder()).toEqual(['Cold start']);
    // Deleted, so no longer chosen.
    expect(
      screen.getByRole('checkbox', { name: 'Select all sessions' }),
    ).not.toBePartiallyChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Select all sessions' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Save selected as file' }),
    ).toHaveAccessibleDescription('Choose sessions to save them together.');

    toOpen.push({ name: 'idle from Sam.json', text: String(saved[0]?.data) });
    await user.click(
      screen.getByRole('button', { name: 'Open recording file…' }),
    );

    expect(
      within(
        screen.getByRole('region', { name: 'Recorded sessions' }),
      ).getByText(/^Opened /),
    ).toHaveTextContent('Opened 1 recording from idle from Sam.json.');
    expect(namesInOrder()).toEqual(['Cold start', 'Idle wobble']);
    expect(sessionCell('Idle wobble', 'Samples')).toHaveTextContent('2');
    expect(sessionCell('Idle wobble', 'Length')).toHaveTextContent('1:05');
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('link', { name: 'Idle wobble' }));

    expect(
      await screen.findByText(/^Opened from idle from Sam\.json on /),
    ).toHaveTextContent(/The file was saved by 14CUX Gauge \S+ on .+\.$/);
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue(
      'Hunts when warm.',
    );

    // Dismissing the dialog opens nothing and says nothing.
    await user.click(screen.getByRole('link', { name: 'All sessions' }));
    await user.click(
      await screen.findByRole('button', { name: 'Open recording file…' }),
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(namesInOrder()).toEqual(['Cold start', 'Idle wobble']);
  });

  it('saves one session as a file from its page', async () => {
    const user = userEvent.setup();
    const { saved } = renderApp(await twoSessions());

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Idle wobble' }));
    await user.click(
      within(screen.getByRole('region', { name: 'Export' })).getByRole(
        'button',
        { name: 'Save as file' },
      ),
    );

    expect(saved.map(({ name }) => name)).toEqual([
      'Idle-wobble-2026-10-05T14-00-00.json',
    ]);

    const file = JSON.parse(String(saved[0]?.data)) as {
      recordings: { name: string; notes: string; endedAt: number }[];
    };

    expect(file.recordings).toMatchObject([
      {
        name: 'Idle wobble',
        notes: 'Hunts when warm.',
        endedAt: START + 65_000,
      },
    ]);
  });

  it('saves a session as a file once however often the button is pressed', async () => {
    const user = userEvent.setup();
    let finishSave = () => undefined as void;
    const names: string[] = [];

    renderApp(await twoSessions(), [], {
      save: (name) => {
        names.push(name);

        return new Promise((resolve) => {
          finishSave = () => {
            resolve('saved');
          };
        });
      },
    });

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Idle wobble' }));

    const save = within(
      screen.getByRole('region', { name: 'Export' }),
    ).getByRole('button', { name: 'Save as file' });

    await user.click(save);

    expect(save).toBeDisabled();

    await user.click(save);
    finishSave();

    await vi.waitFor(() => {
      expect(save).toBeEnabled();
    });
    expect(names).toEqual(['Idle-wobble-2026-10-05T14-00-00.json']);
  });

  it('says why a file cannot be opened, and opens nothing from it', async () => {
    const user = userEvent.setup();
    const valid = {
      kind: '14cux-gauge-recordings',
      version: 1,
      savedAt: START,
      savedBy: '14CUX Gauge 0.13.0',
      recordings: [],
    };
    const store = new MemorySessionStore();

    renderApp(store, [
      { name: 'newer.json', text: JSON.stringify({ ...valid, version: 2 }) },
      {
        name: 'bad.json',
        text: JSON.stringify({ ...valid, savedAt: 'yesterday' }),
      },
      { name: 'drive.csv', text: 'Time since start (s),Time (UTC)\r\n' },
    ]);

    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));

    const open = await screen.findByRole('button', {
      name: 'Open recording file…',
    });

    await user.click(open);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'newer.json could not be opened: it was saved by a newer version of the app (file format 2). Update the app to open it.',
    );

    await user.click(open);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'bad.json could not be opened: it is damaged (savedAt: Invalid input).',
    );

    await user.click(open);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'drive.csv could not be opened: it is not a recording file.',
    );
    expect(await store.list()).toEqual([]);
  });
});

describe('When a recording file cannot be saved or opened', () => {
  it('says why the chosen sessions were not saved', async () => {
    const user = userEvent.setup();

    renderApp(await twoSessions(), [], {
      save: () => Promise.reject(new Error('Disk full')),
    });
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Idle wobble' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Save selected as file' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Idle-wobble-2026-10-05T14-00-00.json could not be saved: Error: Disk full.',
    );
  });

  it('says so when the sessions cannot be read to save them', async () => {
    const user = userEvent.setup();

    class UnreadableSamples extends MemorySessionStore {
      override readSamples(): Promise<never> {
        return Promise.reject(new DOMException('Gone', 'UnknownError'));
      }
    }

    const store = new UnreadableSamples();

    await store.create({
      name: 'Idle wobble',
      source: 'serial',
      startedAt: START,
      identity: null,
    });
    renderApp(store);
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Idle wobble' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Save selected as file' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The recordings could not be read to save them.',
    );

    await user.click(screen.getByRole('link', { name: 'Idle wobble' }));
    await user.click(
      within(await screen.findByRole('region', { name: 'Export' })).getByRole(
        'button',
        { name: 'Save as file' },
      ),
    );

    expect(
      await within(screen.getByRole('region', { name: 'Export' })).findByRole(
        'alert',
      ),
    ).toHaveTextContent('The session could not be read to save it.');
  });

  it('says why a session was not saved from its page', async () => {
    const user = userEvent.setup();

    renderApp(await twoSessions(), [], {
      save: () => Promise.reject(new Error('Disk full')),
    });
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(await screen.findByRole('link', { name: 'Cold start' }));
    await user.click(
      within(screen.getByRole('region', { name: 'Export' })).getByRole(
        'button',
        { name: 'Save as file' },
      ),
    );

    expect(
      await within(screen.getByRole('region', { name: 'Export' })).findByRole(
        'alert',
      ),
    ).toHaveTextContent(
      'Cold-start-2026-10-05T15-00-00.json could not be saved: Error: Disk full.',
    );
  });

  it('says so when the chosen file cannot be read', async () => {
    const user = userEvent.setup();

    renderApp(new MemorySessionStore(), [], {
      open: () => Promise.reject(new DOMException('Moved', 'NotReadableError')),
    });
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(
      await screen.findByRole('button', { name: 'Open recording file…' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The file could not be read.',
    );
  });

  it('says so when the browser cannot store what the file holds', async () => {
    const user = userEvent.setup();

    class Full extends MemorySessionStore {
      override importSessions(
        _sessions: readonly ImportedSession[],
      ): Promise<SessionSummary[]> {
        return Promise.reject(new DOMException('Full', 'QuotaExceededError'));
      }
    }

    const store = new Full();

    renderApp(store, [
      {
        name: 'drive.json',
        text: JSON.stringify({
          kind: '14cux-gauge-recordings',
          version: 1,
          savedAt: START,
          savedBy: '14CUX Gauge 0.13.0',
          recordings: [],
        }),
      },
    ]);
    await user.click(sessionsNav().getByRole('link', { name: 'Sessions' }));
    await user.click(
      await screen.findByRole('button', { name: 'Open recording file…' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'drive.json could not be opened: the browser could not store it.',
    );
    expect(await store.list()).toEqual([]);
  });
});
