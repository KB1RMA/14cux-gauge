// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Dialog } from 'radix-ui';
import { useRef, useState } from 'react';
import { useRecording } from '../recording/useRecording';
import { describeDuration, sourceLabel } from '../sessions/format';
import { useSessions } from '../sessions/useSessions';
import type { SessionSummary } from '../model/session';
import { SessionFields } from './SessionFields';
import styles from './ConfirmDialog.module.css';

function SaveForm({
  session,
  onDone,
}: {
  session: SessionSummary;
  onDone(): void;
}) {
  const { store } = useSessions();
  const [name, setName] = useState(session.name);
  const [notes, setNotes] = useState(session.notes);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

        if (!store) {
          return;
        }

        setSaving(true);
        setError(undefined);
        store
          .update(session.id, { name: name.trim(), notes })
          .then(onDone, () => {
            setSaving(false);
            setError(
              'The changes could not be saved. The recording is kept under its original name.',
            );
          });
      }}
    >
      <SessionFields
        name={name}
        notes={notes}
        onNameChange={setName}
        onNotesChange={setNotes}
      />
      {error ? (
        <p role="alert" className={styles['error']}>
          {error}
        </p>
      ) : null}
      <div className={styles['actions']}>
        <Dialog.Close type="button">Skip</Dialog.Close>
        <button type="submit" className="primary" disabled={saving}>
          Save
        </button>
      </div>
    </form>
  );
}

/**
 * Offers a name and notes for a recording the user has just stopped. The
 * recording is already stored; skipping keeps its default name.
 */
export function SaveSessionDialog() {
  const { finished, dismissFinished } = useRecording();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog.Root
      open={finished !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          dismissFinished();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles['overlay']} />
        <Dialog.Content
          className={styles['dialog']}
          onOpenAutoFocus={() => {
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            // There is no Dialog.Trigger for Radix to return to.
            event.preventDefault();

            const opener = returnFocusRef.current;

            returnFocusRef.current = null;

            // Stopping by disconnecting removes the opener with the
            // dashboard; then start the user at the heading of the view
            // that replaced it.
            const target = opener?.isConnected
              ? opener
              : document.querySelector<HTMLElement>('main h2[tabindex="-1"]');

            target?.focus();
          }}
        >
          <Dialog.Title className={styles['title']}>
            Save recording
          </Dialog.Title>
          {finished ? (
            <>
              <Dialog.Description>
                Recorded{' '}
                {describeDuration(
                  (finished.endedAt ?? finished.startedAt) - finished.startedAt,
                )}{' '}
                from the {sourceLabel(finished.source)}:{' '}
                {finished.sampleCount.toLocaleString()} samples. Name it, and
                add notes if you like, so you can find it in Sessions.
              </Dialog.Description>
              <SaveForm
                key={finished.id}
                session={finished}
                onDone={dismissFinished}
              />
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
