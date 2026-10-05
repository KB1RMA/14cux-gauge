// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { SessionSummary } from '../storage/sessionStore';
import { ConfirmDialog } from './ConfirmDialog';

/** Asks before deleting a recorded session, which cannot be undone. */
export function DeleteSessionDialog({
  session,
  onConfirm,
  onCancel,
}: {
  session: SessionSummary | undefined;
  onConfirm(session: SessionSummary): void;
  onCancel(): void;
}) {
  return (
    <ConfirmDialog
      open={session !== undefined}
      title="Delete this session?"
      confirmLabel="Delete session"
      onConfirm={() => {
        if (session) {
          onConfirm(session);
        }
      }}
      onCancel={onCancel}
    >
      <p>
        “{session?.name}” and its {session?.sampleCount.toLocaleString() ?? 0}{' '}
        samples will be deleted from this browser. This cannot be undone.
      </p>
    </ConfirmDialog>
  );
}
