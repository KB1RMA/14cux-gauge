// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { UnreadableRecord } from '../model/record';
import type { SessionSummary } from '../model/session';
import { ConfirmDialog } from './ConfirmDialog';

/** A session to delete: a readable one, or one that cannot be read. */
export type DeleteTarget = SessionSummary | UnreadableRecord;

/** Asks before deleting a recorded session, which cannot be undone. */
export function DeleteSessionDialog({
  session,
  onConfirm,
  onCancel,
}: {
  session: DeleteTarget | undefined;
  onConfirm(session: DeleteTarget): void;
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
        {session === undefined
          ? null
          : 'detail' in session
            ? 'This session, which cannot be read, and its samples will be deleted from this browser. This cannot be undone.'
            : `“${session.name}” and its ${session.sampleCount.toLocaleString()} samples will be deleted from this browser. This cannot be undone.`}
      </p>
    </ConfirmDialog>
  );
}
