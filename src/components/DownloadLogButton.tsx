// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { DownloadIcon } from '@radix-ui/react-icons';
import { useState } from 'react';
import { BUILD_INFO } from '../buildInfo';
import { formatReport, reportFileName } from '../diagnostics/report';
import { useDiagnostics } from '../diagnostics/useDiagnostics';
import type { ConnectionState } from '../ecu/connectionState';
import { useEcu } from '../ecu/useEcu';
import { saveFile } from '../platform/saveFile';
import { usePlatform } from '../platform/usePlatform';
import styles from './DownloadLogButton.module.css';

function describeConnection(state: ConnectionState): string {
  switch (state.status) {
    case 'idle':
      return 'not connected';
    case 'connecting':
    case 'connected':
      return `${state.status} (${state.source.kind})`;
    case 'error':
      return `error (${state.source.kind}): ${state.message}`;
  }
}

/**
 * Saves the serial trace and connection events as a text file to share, and
 * says so if the file could not be saved. Dismissing a Save dialog needs no
 * message: the user chose it.
 */
export function DownloadLogButton({ primary = false }: { primary?: boolean }) {
  const log = useDiagnostics();
  const { state } = useEcu();
  const { app, files, serial } = usePlatform();
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <>
      <button
        type="button"
        className={primary ? `primary ${styles['button']}` : styles['button']}
        onClick={() => {
          const generatedAt = Date.now();

          setError(undefined);
          void saveFile(
            files,
            reportFileName(generatedAt),
            formatReport(log.snapshot(), {
              generatedAt,
              build: BUILD_INFO,
              userAgent: app.userAgent,
              webSerial: serial.available(),
              connection: describeConnection(state),
            }),
            'text/plain',
          ).then((feedback) => {
            if (feedback?.kind === 'failed') {
              setError(feedback.message);
            }
          });
        }}
      >
        <DownloadIcon aria-hidden="true" />
        Download diagnostic log
      </button>
      {/* A span, as the footer puts the button in a paragraph. */}
      {error ? (
        <span role="alert" className={styles['error']}>
          {error}
        </span>
      ) : null}
    </>
  );
}
