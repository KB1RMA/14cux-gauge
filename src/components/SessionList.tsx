// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { DownloadIcon, UploadIcon } from '@radix-ui/react-icons';
import type { RowSelectionState } from '@tanstack/react-table';
import { Toolbar, VisuallyHidden } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import {
  RECORDING_FILE_EXTENSION,
  RECORDING_FILE_TYPE,
  RecordingFileError,
} from '../model/recordingFile';
import { saveFile } from '../platform/saveFile';
import { usePlatform } from '../platform/usePlatform';
import { useRecording } from '../recording/useRecording';
import { useSessionList } from '../sessions/useSessionList';
import { useSessions } from '../sessions/useSessions';
import { DeleteSessionDialog, type DeleteTarget } from './DeleteSessionDialog';
import { SessionTable } from './SessionTable';
import styles from './Sessions.module.css';

/** What became of the last file the user saved or opened. */
type FileFeedback =
  { kind: 'opened'; message: string } | { kind: 'failed'; message: string };

function recordingsCount(count: number): string {
  return `${String(count)} recording${count === 1 ? '' : 's'}`;
}

/**
 * Every recorded session, newest first. `returnTo` is the session the user
 * has just come back from; its link gets focus, or else the heading.
 */
export function SessionList({ returnTo }: { returnTo: string | undefined }) {
  const { persistent, opened, remove, exportFile, importFile } = useSessions();
  const { files } = usePlatform();
  const { active } = useRecording();
  const list = useSessionList();
  const [deleting, setDeleting] = useState<DeleteTarget | undefined>(undefined);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FileFeedback | undefined>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openLinksRef = useRef(new Map<string, HTMLAnchorElement>());
  const loaded = list.status === 'loaded';
  const sessions = list.status === 'loaded' ? list.sessions : [];
  // Only sessions still in the list: one deleted since keeps its choice in
  // `selection` until the next change, but is neither saved nor counted.
  const selected = sessions.filter((session) => selection[session.id]);
  const shownSelection: RowSelectionState = Object.fromEntries(
    selected.map((session) => [session.id, true]),
  );

  // Once the list is on screen, put the user where they were.
  useEffect(() => {
    if (!loaded) {
      return;
    }

    const target =
      returnTo === undefined ? undefined : openLinksRef.current.get(returnTo);

    (target ?? headingRef.current)?.focus();
  }, [loaded, returnTo]);

  const saveSelected = async () => {
    try {
      const file = await exportFile(selected.map((session) => session.id));
      const result = await saveFile(
        files,
        file.name,
        file.text,
        RECORDING_FILE_TYPE,
      );

      if (result?.kind === 'failed') {
        setFeedback({ kind: 'failed', message: result.message });
      }
    } catch {
      setFeedback({
        kind: 'failed',
        message: 'The recordings could not be read to save them.',
      });
    }
  };

  // Not busy while the picker is up: a browser that never says the user
  // dismissed it would leave the buttons disabled.
  const openFile = async () => {
    let file;

    setFeedback(undefined);

    try {
      file = await files.open([RECORDING_FILE_EXTENSION]);
    } catch {
      setFeedback({
        kind: 'failed',
        message: 'The file could not be read.',
      });

      return;
    }

    if (file === 'cancelled') {
      return;
    }

    setBusy(true);

    try {
      const imported = await importFile(file);

      setFeedback({
        kind: 'opened',
        message: `Opened ${recordingsCount(imported.length)} from ${file.name}.`,
      });
    } catch (error) {
      setFeedback({
        kind: 'failed',
        message:
          error instanceof RecordingFileError
            ? error.message
            : `${file.name} could not be opened: the browser could not store it.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const fileAction = (action: () => Promise<void>) => () => {
    setBusy(true);
    setFeedback(undefined);
    void action().finally(() => {
      setBusy(false);
    });
  };

  return (
    <section aria-labelledby="sessions-title" className={styles['sessions']}>
      <h2
        id="sessions-title"
        ref={headingRef}
        tabIndex={-1}
        className={styles['title']}
      >
        Recorded sessions
      </h2>

      {persistent === false ? (
        <p className={styles['notice']}>
          This browser is not letting the app keep data, so recordings last only
          until the page is closed or reloaded.
        </p>
      ) : null}

      {deleteFailed ? (
        <p role="alert" className={styles['error']}>
          The session could not be deleted.
        </p>
      ) : null}

      <div className={styles['tableFrame']}>
        <Toolbar.Root aria-label="Sessions" className={styles['toolbar']}>
          <p id="sessions-selected" className={styles['selected']}>
            {selected.length === 0
              ? 'Choose sessions to save them together.'
              : `${String(selected.length)} of ${String(sessions.length)} selected.`}
          </p>
          <Toolbar.Button
            disabled={selected.length === 0 || busy}
            aria-describedby="sessions-selected"
            onClick={fileAction(saveSelected)}
          >
            <DownloadIcon aria-hidden="true" />
            Save selected as file
          </Toolbar.Button>
          <Toolbar.Button
            className={styles['toolbarEnd']}
            disabled={!opened || busy}
            onClick={() => {
              void openFile();
            }}
          >
            <UploadIcon aria-hidden="true" />
            Open recording file…
          </Toolbar.Button>
        </Toolbar.Root>
        {/* Present before it has anything to say, so it is announced. */}
        <output className={styles['opened']}>
          {feedback?.kind === 'opened' ? feedback.message : null}
        </output>
        {feedback?.kind === 'failed' ? (
          <p
            role="alert"
            className={`${styles['error'] ?? ''} ${styles['banner'] ?? ''}`}
          >
            {feedback.message}
          </p>
        ) : null}

        {list.status === 'loading' ? (
          <p className={styles['frameMessage']}>Loading sessions…</p>
        ) : null}
        {list.status === 'failed' ? (
          <p
            role="alert"
            className={`${styles['error'] ?? ''} ${styles['frameMessage'] ?? ''}`}
          >
            The recorded sessions could not be read.
          </p>
        ) : null}
        {list.status === 'loaded' &&
        list.sessions.length === 0 &&
        list.unreadable.length === 0 ? (
          <p
            className={`${styles['empty'] ?? ''} ${styles['frameMessage'] ?? ''}`}
          >
            No sessions yet. While connected to an ECU, choose Record in the
            status bar to record one, or open a recording file.
          </p>
        ) : null}
        {list.status === 'loaded' && list.sessions.length > 0 ? (
          <SessionTable
            sessions={list.sessions}
            recordingId={active?.id}
            selection={shownSelection}
            onSelectionChange={setSelection}
            onDelete={setDeleting}
            linkRef={(id, link) => {
              if (link) {
                openLinksRef.current.set(id, link);
              } else {
                openLinksRef.current.delete(id);
              }
            }}
          />
        ) : null}
      </div>
      <p className={styles['hint']}>
        A recording file keeps every sample at full precision, with notes, the
        ECU’s identity and writes to the ECU, so it can be opened here or on
        another computer. Use Export CSV on a session to analyse it in another
        tool.
      </p>

      {list.status === 'loaded' && list.unreadable.length > 0 ? (
        <section aria-labelledby="unreadable-title">
          <h3 id="unreadable-title" className={styles['subtitle']}>
            Sessions that can’t be read
          </h3>
          <ul className={styles['list']}>
            {list.unreadable.map((unreadable) => (
              <li key={unreadable.id} className={styles['item']}>
                <p className={styles['unreadable']}>
                  {unreadable.detail}. Its ID is <code>{unreadable.id}</code>.
                </p>
                <button
                  type="button"
                  className={`danger ${styles['delete'] ?? ''}`}
                  onClick={() => {
                    setDeleting(unreadable);
                  }}
                >
                  Delete{' '}
                  <VisuallyHidden.Root>
                    session that can’t be read, {unreadable.id}
                  </VisuallyHidden.Root>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DeleteSessionDialog
        session={deleting}
        onCancel={() => {
          setDeleting(undefined);
        }}
        onConfirm={(session) => {
          setDeleting(undefined);
          setDeleteFailed(false);
          remove(session.id).then(
            () => {
              // Its Delete button is about to go; start again at the top.
              headingRef.current?.focus();
            },
            () => {
              setDeleteFailed(true);
            },
          );
        }}
      />
    </section>
  );
}
