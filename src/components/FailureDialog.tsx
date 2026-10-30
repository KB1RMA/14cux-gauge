// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Dialog } from 'radix-ui';
import { useId } from 'react';
import {
  CABLE_NOTES_URL,
  HARDWARE_NOTES_URL,
  connectionHelp,
} from '../ecu/connectionHelp';
import type { FailureStage } from '../ecu/errors';
import { formatRecentEntries } from '../diagnostics/report';
import { useDiagnostics } from '../diagnostics/useDiagnostics';
import { DownloadLogButton } from './DownloadLogButton';
import { ExternalLink } from './ExternalLink';
import dialogStyles from './ConfirmDialog.module.css';
import styles from './FailureDialog.module.css';

/** Enough to show the failed exchange; the download has the whole log. */
const RECENT_ENTRIES = 200;

export interface FailureDialogProps {
  open: boolean;
  /** The explanation shown in the status bar. */
  message: string;
  /** The raw error name and message, if known. */
  detail: string | undefined;
  /** How far the connection got, if known. */
  stage: FailureStage | undefined;
  /** Connects at this baud rate, if another is worth offering. */
  otherBaud?: { rate: string; connect(): void } | undefined;
  onClose(): void;
  /** Where focus goes when the dialog closes. */
  onCloseAutoFocus(): void;
}

function RecentLog() {
  const log = useDiagnostics();
  const id = useId();
  const text = formatRecentEntries(log.snapshot(), RECENT_ENTRIES);

  return (
    <div className={styles['field']}>
      <label htmlFor={id}>Recent log</label>
      <textarea
        id={id}
        className={styles['log']}
        // The failure is at the end; start there.
        ref={(textarea) => {
          if (textarea) {
            textarea.scrollTop = textarea.scrollHeight;
          }
        }}
        readOnly
        rows={12}
        spellCheck={false}
        value={text === '' ? 'Nothing has been logged.' : text}
      />
    </div>
  );
}

/** What to check for a failure at `stage`, and where to read more. */
function Checks({ stage }: { stage: FailureStage }) {
  const { checks, cableNotes } = connectionHelp(stage);
  const id = useId();

  return (
    <>
      <h3 id={id} className={styles['heading']}>
        What to check
      </h3>
      <ul aria-labelledby={id} className={styles['checks']}>
        {checks.map((check) => (
          <li key={check}>{check}</li>
        ))}
      </ul>
      {cableNotes ? (
        <p>
          See the app&apos;s{' '}
          <ExternalLink href={HARDWARE_NOTES_URL}>hardware notes</ExternalLink>{' '}
          and the{' '}
          <ExternalLink href={CABLE_NOTES_URL}>
            cable and latency-timer notes
          </ExternalLink>
          .
        </p>
      ) : null}
    </>
  );
}

/**
 * Shown when a connection fails: what went wrong in plain words, what to
 * check, the raw error, the most recent serial traffic, and the full log to
 * download.
 */
export function FailureDialog({
  open,
  message,
  detail,
  stage,
  otherBaud,
  onClose,
  onCloseAutoFocus,
}: FailureDialogProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={dialogStyles['overlay']} />
        <Dialog.Content
          className={`${dialogStyles['dialog']} ${styles['dialog']}`}
          onCloseAutoFocus={(event) => {
            // Opened by the failure rather than a trigger; the parent knows
            // where the user should land.
            event.preventDefault();
            onCloseAutoFocus();
          }}
        >
          <Dialog.Title className={dialogStyles['title']}>
            Connection failed
          </Dialog.Title>
          <Dialog.Description>{message}</Dialog.Description>
          {stage === undefined ? null : <Checks stage={stage} />}
          {detail === undefined ? null : (
            <p>
              Error: <code className={styles['detail']}>{detail}</code>
            </p>
          )}
          {open ? <RecentLog /> : null}
          <p className={styles['hint']}>
            The downloaded log has every byte sent and received since the page
            was opened.
          </p>
          <div className={dialogStyles['actions']}>
            <Dialog.Close type="button">Close</Dialog.Close>
            {otherBaud ? (
              <Dialog.Close type="button" onClick={otherBaud.connect}>
                Try {otherBaud.rate} baud
              </Dialog.Close>
            ) : null}
            <DownloadLogButton primary />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
