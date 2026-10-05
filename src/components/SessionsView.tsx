// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useState } from 'react';
import { SessionDetail } from './SessionDetail';
import { SessionList } from './SessionList';

/** Browses recorded sessions, and opens one to replay or edit it. */
export function SessionsView() {
  const [open, setOpen] = useState<string | undefined>(undefined);
  const [returnTo, setReturnTo] = useState<string | undefined>(undefined);

  return open === undefined ? (
    <SessionList returnTo={returnTo} onOpen={setOpen} />
  ) : (
    <SessionDetail
      id={open}
      onClose={() => {
        setReturnTo(open);
        setOpen(undefined);
      }}
    />
  );
}
