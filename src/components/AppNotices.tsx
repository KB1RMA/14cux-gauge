// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useState } from 'react';
import { useEcu } from '../ecu/useEcu';
import { describeBuild } from '../pwa/build';
import { useAppStatus } from '../pwa/useAppStatus';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './AppNotices.module.css';

/**
 * Says when the app is offline and when a newer build is available. Neither
 * stops the app working: the build on the page is complete without a
 * network, and an update waits until the user chooses to reload.
 */
export function AppNotices() {
  const { running, online, latest, update, applyUpdate } = useAppStatus();
  const { state } = useEcu();
  const [confirming, setConfirming] = useState(false);
  const inUse = state.status !== 'idle';

  if (online && update === 'none') {
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
                if (inUse) {
                  setConfirming(true);
                } else {
                  applyUpdate();
                }
              }}
            >
              Reload to update
            </button>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title="Reload to update?"
        confirmLabel="Reload and disconnect"
        onConfirm={applyUpdate}
        onCancel={() => {
          setConfirming(false);
        }}
      >
        <p>
          Reloading closes the connection to the ECU and ends any recording in
          progress. Update when you are not in the middle of a diagnosis.
        </p>
      </ConfirmDialog>
    </section>
  );
}
