// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useState } from 'react';
import { useMatch } from 'react-router';
import { SESSIONS_PATH } from '../routing/paths';
import { SessionDetail } from './SessionDetail';
import { SessionList } from './SessionList';

/**
 * Browses recorded sessions, and opens one to replay or edit it. Which
 * session is open comes from the address, so Back returns to the list.
 */
export function SessionsView() {
  const graphs = useMatch(`${SESSIONS_PATH}/:id/graphs`);
  const detail = useMatch(`${SESSIONS_PATH}/:id`);
  const id = (graphs ?? detail)?.params['id'];
  const session =
    id === undefined
      ? undefined
      : { id, tab: graphs ? ('graphs' as const) : ('readings' as const) };
  const [lastOpened, setLastOpened] = useState<string | undefined>(undefined);

  // Remember the session the user is looking at, so the list can put focus
  // back on it when they return.
  if (session && session.id !== lastOpened) {
    setLastOpened(session.id);
  }

  return session ? (
    <SessionDetail id={session.id} tab={session.tab} />
  ) : (
    <SessionList returnTo={lastOpened} />
  );
}
