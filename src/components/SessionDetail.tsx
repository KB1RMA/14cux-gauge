// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { ArrowLeftIcon, DownloadIcon } from '@radix-ui/react-icons';
import { useEffect, useRef, useState } from 'react';
import { saveFile } from '../platform/saveFile';
import { usePlatform } from '../platform/usePlatform';
import { usePreferences } from '../preferences/usePreferences';
import { useRecording } from '../recording/useRecording';
import { sessionCsv, sessionCsvFileName } from '../sessions/exportCsv';
import { Link, useNavigate } from 'react-router';
import { SESSIONS_PATH, sessionPath, type ReplayTab } from '../routing/paths';
import { useSessionList } from '../sessions/useSessionList';
import { useSessionSamples } from '../sessions/useSessionSamples';
import { useSessions } from '../sessions/useSessions';
import { keepsWrites, type SessionSummary } from '../model/session';
import { DeleteSessionDialog } from './DeleteSessionDialog';
import { SessionFields } from './SessionFields';
import { SessionMeta } from './SessionMeta';
import { SessionReplay } from './SessionReplay';
import styles from './Sessions.module.css';

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function DetailsForm({ session }: { session: SessionSummary }) {
  const { edit } = useSessions();
  const [name, setName] = useState(session.name);
  const [notes, setNotes] = useState(session.notes);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const changed = name.trim() !== session.name || notes !== session.notes;

  return (
    <form
      className={styles['form']}
      onSubmit={(event) => {
        event.preventDefault();
        setSaveState('saving');
        edit(session.id, { name: name.trim(), notes }).then(
          () => {
            setSaveState('saved');
          },
          () => {
            setSaveState('failed');
          },
        );
      }}
    >
      <SessionFields
        name={name}
        notes={notes}
        onNameChange={(next) => {
          setName(next);
          setSaveState('idle');
        }}
        onNotesChange={(next) => {
          setNotes(next);
          setSaveState('idle');
        }}
      />
      <div className={styles['formActions']}>
        <button
          type="submit"
          className="primary"
          disabled={!changed || saveState === 'saving'}
        >
          Save changes
        </button>
        <output>
          {saveState === 'saved' ? 'Changes saved.' : null}
          {saveState === 'failed' ? 'The changes could not be saved.' : null}
        </output>
      </div>
    </form>
  );
}

/** One recorded session: replay it, rename it, keep notes, or delete it. */
export function SessionDetail({ id, tab }: { id: string; tab: ReplayTab }) {
  const navigate = useNavigate();
  const { remove } = useSessions();
  const { active } = useRecording();
  const list = useSessionList();
  const samples = useSessionSamples(id);
  const { temperatureUnit, speedUnit } = usePreferences();
  const { files } = usePlatform();
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // Why the last export of a session was not saved, kept with its id so it
  // is not shown on another session.
  const [exportFailed, setExportFailed] = useState<
    { id: string; message: string } | undefined
  >(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const session =
    list.status === 'loaded'
      ? list.sessions.find((candidate) => candidate.id === id)
      : undefined;
  const found = session !== undefined;
  const recording = active?.id === id;

  useEffect(() => {
    if (found) {
      headingRef.current?.focus();
    }
  }, [found]);

  const back = (
    <Link to={SESSIONS_PATH} className={styles['back']}>
      <ArrowLeftIcon aria-hidden="true" />
      All sessions
    </Link>
  );

  if (list.status !== 'loaded') {
    return (
      <section aria-label="Session" className={styles['sessions']}>
        {back}
        {list.status === 'loading' ? (
          <p>Loading session…</p>
        ) : (
          <p role="alert" className={styles['error']}>
            The session could not be read.
          </p>
        )}
      </section>
    );
  }

  if (!session) {
    return (
      <section aria-label="Session" className={styles['sessions']}>
        {back}
        <p>This session has been deleted.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="session-title" className={styles['sessions']}>
      {back}
      <h2
        id="session-title"
        ref={headingRef}
        tabIndex={-1}
        className={styles['title']}
      >
        {session.name}
      </h2>
      <SessionMeta session={session} recording={recording} />

      <div className={styles['detail']}>
        <section aria-labelledby="replay-title">
          <h3 id="replay-title" className={styles['subtitle']}>
            Replay
          </h3>
          {recording ? (
            <p className={styles['notice']}>
              Still recording. The replay has the samples saved when you opened
              this session.
            </p>
          ) : null}
          {samples.status === 'loading' ? <p>Loading samples…</p> : null}
          {samples.status === 'failed' ? (
            <p role="alert" className={styles['error']}>
              The samples could not be read.
            </p>
          ) : null}
          {samples.status === 'loaded' && samples.samples.length === 0 ? (
            <p>No samples were recorded in this session.</p>
          ) : null}
          {samples.status === 'loaded' && samples.samples.length > 0 ? (
            <SessionReplay
              key={id}
              id={id}
              tab={tab}
              samples={samples.samples}
              writes={samples.writes}
              keepsWrites={keepsWrites(session)}
            />
          ) : null}
        </section>

        <aside className={styles['side']}>
          <section aria-labelledby="details-title">
            <h3 id="details-title" className={styles['subtitle']}>
              Name and notes
            </h3>
            <DetailsForm key={session.id} session={session} />
          </section>
          <section aria-labelledby="export-title">
            <h3 id="export-title" className={styles['subtitle']}>
              Export
            </h3>
            <p className={styles['hint']}>
              One row per sample, in your chosen units, with the unit in each
              column heading. Invalid readings are left empty.
            </p>
            {exportFailed?.id === id ? (
              <p role="alert" className={styles['error']}>
                {exportFailed.message}
              </p>
            ) : null}
            <button
              type="button"
              disabled={
                samples.status !== 'loaded' || samples.samples.length === 0
              }
              onClick={() => {
                if (samples.status === 'loaded') {
                  setExportFailed(undefined);
                  void saveFile(
                    files,
                    sessionCsvFileName(session.name, session.startedAt),
                    sessionCsv(samples.samples, { temperatureUnit, speedUnit }),
                    'text/csv',
                  ).then((feedback) => {
                    if (feedback?.kind === 'failed') {
                      setExportFailed({ id, message: feedback.message });
                    }
                  });
                }
              }}
            >
              <DownloadIcon aria-hidden="true" />
              Export CSV
            </button>
          </section>
          <section aria-labelledby="delete-title">
            <h3 id="delete-title" className={styles['subtitle']}>
              Delete
            </h3>
            {recording ? (
              <p id="delete-hint" className={styles['hint']}>
                Stop recording before deleting this session.
              </p>
            ) : null}
            {deleteFailed ? (
              <p role="alert" className={styles['error']}>
                The session could not be deleted.
              </p>
            ) : null}
            <button
              type="button"
              className="danger"
              disabled={recording}
              aria-describedby={recording ? 'delete-hint' : undefined}
              onClick={() => {
                setDeleting(true);
              }}
            >
              Delete session
            </button>
          </section>
        </aside>
      </div>

      <DeleteSessionDialog
        session={deleting ? session : undefined}
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={(target) => {
          setDeleting(false);
          setDeleteFailed(false);
          remove(target.id).then(
            () => {
              // The user may have moved on while it was deleting; only leave
              // the session if it is still showing.
              const showing = [
                sessionPath(target.id),
                sessionPath(target.id, 'graphs'),
              ].some((path) => window.location.hash === `#${path}`);

              if (showing) {
                // Back would only lead to the session that is now gone.
                void navigate(SESSIONS_PATH, { replace: true });
              }
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
