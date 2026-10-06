// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { DownloadIcon } from '@radix-ui/react-icons';
import { BUILD_INFO } from '../buildInfo';
import {
  downloadText,
  formatReport,
  reportFileName,
} from '../diagnostics/report';
import { useDiagnostics } from '../diagnostics/useDiagnostics';
import type { ConnectionState } from '../ecu/connectionState';
import { useEcu } from '../ecu/useEcu';
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

/** Saves the serial trace and connection events as a text file to share. */
export function DownloadLogButton({ primary = false }: { primary?: boolean }) {
  const log = useDiagnostics();
  const { state } = useEcu();

  return (
    <button
      type="button"
      className={primary ? `primary ${styles['button']}` : styles['button']}
      onClick={() => {
        const generatedAt = Date.now();

        downloadText(
          reportFileName(generatedAt),
          formatReport(log.snapshot(), {
            generatedAt,
            build: BUILD_INFO,
            userAgent: navigator.userAgent,
            webSerial: 'serial' in navigator,
            connection: describeConnection(state),
          }),
        );
      }}
    >
      <DownloadIcon aria-hidden="true" />
      Download diagnostic log
    </button>
  );
}
