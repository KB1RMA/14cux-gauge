// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { ArrowLeftIcon } from '@radix-ui/react-icons';
import { useEffect, useRef, useState } from 'react';
import { useRecording } from '../recording/useRecording';
import { useSessionList } from '../sessions/useSessionList';
import { useSessionSamples } from '../sessions/useSessionSamples';
import { useSessions } from '../sessions/useSessions';
import type { SessionSummary } from '../storage/sessionStore';
import { DeleteSessionDialog } from './DeleteSessionDialog';
import { SessionFields } from './SessionFields';
import { SessionMeta } from './SessionMeta';
import { SessionReplay } from './SessionReplay';
import styles from './Sessions.module.css';

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function DetailsForm({ session }: { session: SessionSummary }) {
  const { store } = useSessions();
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
        store?.update(session.id, { name: name.trim(), notes }).then(
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
export function SessionDetail({
  id,
  onClose,
}: {
  id: string;
  onClose(): void;
}) {
  const { store } = useSessions();
  const { active } = useRecording();
  const list = useSessionList();
  const samples = useSessionSamples(id);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
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
    <button type="button" className={styles['back']} onClick={onClose}>
      <ArrowLeftIcon aria-hidden="true" />
      All sessions
    </button>
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
            <SessionReplay key={id} samples={samples.samples} />
          ) : null}
        </section>

        <aside className={styles['side']}>
          <section aria-labelledby="details-title">
            <h3 id="details-title" className={styles['subtitle']}>
              Name and notes
            </h3>
            <DetailsForm key={session.id} session={session} />
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
          store?.remove(target.id).then(onClose, () => {
            setDeleteFailed(true);
          });
        }}
      />
    </section>
  );
}
