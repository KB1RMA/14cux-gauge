// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { VisuallyHidden } from 'radix-ui';
import { Link } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useRecording } from '../recording/useRecording';
import { useSessionList } from '../sessions/useSessionList';
import { useSessions } from '../sessions/useSessions';
import { sessionPath } from '../routing/paths';
import type { SessionSummary } from '../storage/sessionStore';
import { DeleteSessionDialog } from './DeleteSessionDialog';
import { SessionMeta } from './SessionMeta';
import styles from './Sessions.module.css';

/**
 * Every recorded session, newest first. `returnTo` is the session the user
 * has just come back from; its link gets focus, or else the heading.
 */
export function SessionList({ returnTo }: { returnTo: string | undefined }) {
  const { store, persistent } = useSessions();
  const { active } = useRecording();
  const list = useSessionList();
  const [deleting, setDeleting] = useState<SessionSummary | undefined>(
    undefined,
  );
  const [deleteFailed, setDeleteFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openLinksRef = useRef(new Map<string, HTMLAnchorElement>());
  const loaded = list.status === 'loaded';

  // Once the list is on screen, put the user where they were.
  useEffect(() => {
    if (!loaded) {
      return;
    }

    const target =
      returnTo === undefined ? undefined : openLinksRef.current.get(returnTo);

    (target ?? headingRef.current)?.focus();
  }, [loaded, returnTo]);

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

      {store && !persistent ? (
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

      {list.status === 'loading' ? <p>Loading sessions…</p> : null}
      {list.status === 'failed' ? (
        <p role="alert" className={styles['error']}>
          The recorded sessions could not be read.
        </p>
      ) : null}
      {list.status === 'loaded' && list.sessions.length === 0 ? (
        <p className={styles['empty']}>
          No sessions yet. While connected to an ECU, choose Record in the
          status bar to record one.
        </p>
      ) : null}
      {list.status === 'loaded' && list.sessions.length > 0 ? (
        <ul className={styles['list']}>
          {list.sessions.map((session) => {
            const recording = active?.id === session.id;

            return (
              <li key={session.id} className={styles['item']}>
                <h3 className={styles['name']}>
                  <Link
                    ref={(link) => {
                      if (link) {
                        openLinksRef.current.set(session.id, link);
                      } else {
                        openLinksRef.current.delete(session.id);
                      }
                    }}
                    to={sessionPath(session.id)}
                    className={styles['open']}
                  >
                    {session.name}
                  </Link>
                </h3>
                <SessionMeta session={session} recording={recording} />
                {session.notes ? (
                  <p className={styles['notes']}>{session.notes}</p>
                ) : null}
                <button
                  type="button"
                  className={`danger ${styles['delete'] ?? ''}`}
                  disabled={recording}
                  onClick={() => {
                    setDeleting(session);
                  }}
                >
                  Delete{' '}
                  <VisuallyHidden.Root>{session.name}</VisuallyHidden.Root>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <DeleteSessionDialog
        session={deleting}
        onCancel={() => {
          setDeleting(undefined);
        }}
        onConfirm={(session) => {
          setDeleting(undefined);
          setDeleteFailed(false);
          store?.remove(session.id).then(
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
