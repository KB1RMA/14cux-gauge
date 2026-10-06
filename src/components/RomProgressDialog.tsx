// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { AlertDialog } from 'radix-ui';
import { useId, type RefObject } from 'react';
import type { RomProgress } from '../roms/context';
import styles from './ConfirmDialog.module.css';

/**
 * Shows how far the ROM read has got. It is modal: nothing else may use the
 * link while the image is read, and Cancel (or Escape) stops the read.
 */
export function RomProgressDialog({
  progress,
  returnFocusTo,
  onCancel,
}: {
  progress: RomProgress | undefined;
  /** What gets focus when the dialog closes. */
  returnFocusTo: RefObject<HTMLElement | null>;
  onCancel(): void;
}) {
  const labelId = useId();
  const percent = progress
    ? Math.floor((progress.bytesRead * 100) / progress.total)
    : 0;

  return (
    <AlertDialog.Root
      open={progress !== undefined}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles['overlay']} />
        <AlertDialog.Content
          className={styles['dialog']}
          onCloseAutoFocus={(event) => {
            // There is no AlertDialog.Trigger for Radix to return to.
            event.preventDefault();
            returnFocusTo.current?.focus();
          }}
        >
          <AlertDialog.Title className={styles['title']}>
            Reading the ROM image
          </AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div>
              <p id={labelId}>
                {progress?.cancelling
                  ? 'Stopping…'
                  : 'Live readings are paused until the ECU has sent the whole image.'}
              </p>
              <progress
                aria-labelledby={labelId}
                className={styles['progress']}
                max={progress?.total ?? 1}
                value={progress?.bytesRead ?? 0}
              />
              <p>
                {percent}% ({progress?.bytesRead.toLocaleString() ?? 0} of{' '}
                {progress?.total.toLocaleString() ?? 0} bytes)
              </p>
            </div>
          </AlertDialog.Description>
          <div className={styles['actions']}>
            <AlertDialog.Cancel disabled={progress?.cancelling === true}>
              Cancel
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
