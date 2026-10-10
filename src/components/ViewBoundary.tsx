// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useEcu } from '../ecu/useEcu';
import { usePlatform } from '../platform/usePlatform';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './ViewBoundary.module.css';

/**
 * Shown in place of a view that failed, or whose code could not be
 * downloaded. Only a reload brings it back; that ends a connection, so it
 * asks first while connected.
 */
function ViewError({ error }: FallbackProps) {
  const { state } = useEcu();
  const { app } = usePlatform();
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // It replaces the view the user was using; start them at its heading.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="view-error" className={styles['error']}>
      <h2 id="view-error" ref={headingRef} tabIndex={-1}>
        This view could not be shown
      </h2>
      <p>
        If you are offline or a newer version of the app has been published,
        part of it may not have downloaded. Reload the page to try again.
      </p>
      <p>
        Error:{' '}
        <code>{error instanceof Error ? error.message : String(error)}</code>
      </p>
      <button
        type="button"
        className="primary"
        onClick={() => {
          if (state.status === 'idle') {
            app.reload();
          } else {
            setConfirming(true);
          }
        }}
      >
        Reload
      </button>
      <ConfirmDialog
        open={confirming}
        title="Reload the page?"
        confirmLabel="Reload and disconnect"
        onConfirm={app.reload}
        onCancel={() => {
          setConfirming(false);
        }}
      >
        <p>
          Reloading closes the connection to the ECU and ends any recording in
          progress.
        </p>
      </ConfirmDialog>
    </section>
  );
}

/**
 * Wraps one view, so that its code can be loaded lazily and a failure in it
 * leaves the app bar and status bar working. Give each view a boundary of
 * its own: a new boundary shows "Loading…" at once, where a shared one would
 * keep the view the user left on screen while the next one loads.
 */
export function ViewBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={ViewError}>
      <Suspense fallback={<p>Loading…</p>}>{children}</Suspense>
    </ErrorBoundary>
  );
}
