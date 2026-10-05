// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { AlertDialog } from 'radix-ui';
import { useRef, type ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen and what could go wrong. */
  children: ReactNode;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * Modal confirmation shown before any action that writes to the ECU.
 *
 * Radix's AlertDialog traps focus, hides the rest of the page from assistive
 * tech, starts on Cancel (the safe choice) and treats Escape as Cancel. `open`
 * stays the parent's, so it can be opened by any control; that control gets
 * focus back on close, if it is still there.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <AlertDialog.Root
      open={open}
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
          onOpenAutoFocus={() => {
            // Runs before Radix moves focus to Cancel, so this is the opener.
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            // There is no AlertDialog.Trigger for Radix to return to.
            event.preventDefault();

            const opener = returnFocusRef.current;

            returnFocusRef.current = null;

            // The opener may have gone (or been disabled) while it was open.
            if (opener?.isConnected) {
              opener.focus();
            }
          }}
        >
          <AlertDialog.Title className={styles['title']}>
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div>{children}</div>
          </AlertDialog.Description>
          <div className={styles['actions']}>
            <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
            {/* Not AlertDialog.Action: that would also report a close, which
                onOpenChange cannot tell apart from Cancel. The parent closes
                the dialog by clearing `open`. */}
            <button type="button" className="danger" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
