// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useState } from 'react';
import { useEcu } from '../ecu/useEcu';
import { usePlatform } from '../platform/usePlatform';
import { describeBuild } from '../pwa/build';
import { useSessions } from '../sessions/useSessions';
import { useAppStatus } from '../pwa/useAppStatus';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './AppNotices.module.css';

/**
 * Says when the app is offline and when a newer build is available. Neither
 * stops the app working: the build on the page is complete without a
 * network, and an update waits until the user chooses to reload. It also
 * says when the saved sessions and ROM images became unavailable, which
 * only a reload fixes.
 */
export function AppNotices() {
  const { running, online, latest, update, applyUpdate } = useAppStatus();
  const { state } = useEcu();
  const { unavailable: storage } = useSessions();
  const { app } = usePlatform();
  // What the confirmation reloads for. Kept after it closes, so its text does
  // not change while it fades out.
  const [reason, setReason] = useState<'update' | 'storage'>('update');
  const [confirming, setConfirming] = useState(false);
  const inUse = state.status !== 'idle';

  /** Runs `reload` now, or once the user has confirmed if work would be lost. */
  const reloadFor = (why: 'update' | 'storage', reload: () => void) => {
    if (inUse) {
      setReason(why);
      setConfirming(true);
    } else {
      reload();
    }
  };

  if (
    online &&
    update === 'none' &&
    storage !== 'closed' &&
    storage !== 'failed'
  ) {
    return null;
  }

  const newer = latest ? describeBuild(latest) : 'A newer version';

  return (
    <section aria-label="App status" className={styles['notices']}>
      {online ? null : (
        <div className={styles['notice']} data-kind="offline">
          <output>
            Offline. Running {describeBuild(running)} from this device;
            connecting to an ECU, recording and saved sessions work as normal.
            Updates are checked when you are back online.
          </output>
        </div>
      )}
      {storage === 'closed' ? (
        <div className={styles['notice']} data-kind="storage">
          <output>
            Saved sessions and ROM images are unavailable: another window of
            this app updated the browser&apos;s storage. Reload this page to use
            them again. Recordings and ROM reads cannot be saved until then.
          </output>
          <button
            type="button"
            className="primary"
            onClick={() => {
              reloadFor('storage', app.reload);
            }}
          >
            Reload
          </button>
        </div>
      ) : null}
      {storage === 'failed' ? (
        <div className={styles['notice']} data-kind="storage">
          <output>
            Saved sessions and ROM images could not be opened. Reload this page
            to try again.
          </output>
          <button
            type="button"
            className="primary"
            onClick={() => {
              reloadFor('storage', app.reload);
            }}
          >
            Reload
          </button>
        </div>
      ) : null}
      {update === 'none' ? null : (
        <div className={styles['notice']} data-kind="update">
          <output>
            {newer} is available
            {update === 'downloading' ? ' and is being downloaded.' : '.'}
          </output>
          {update === 'ready' ? (
            <button
              type="button"
              className="primary"
              onClick={() => {
                reloadFor('update', applyUpdate);
              }}
            >
              Reload to update
            </button>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={reason === 'storage' ? 'Reload the page?' : 'Reload to update?'}
        confirmLabel="Reload and disconnect"
        onConfirm={reason === 'storage' ? app.reload : applyUpdate}
        onCancel={() => {
          setConfirming(false);
        }}
      >
        <p>
          Reloading closes the connection to the ECU and ends any recording in
          progress.{' '}
          {reason === 'storage'
            ? 'Recordings made until then cannot be saved.'
            : 'Update when you are not in the middle of a diagnosis.'}
        </p>
      </ConfirmDialog>
    </section>
  );
}
