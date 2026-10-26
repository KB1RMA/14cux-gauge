// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useLocation, useNavigate } from 'react-router';
import {
  PREFERENCES_PARAM,
  PREFERENCES_SECTIONS,
  type PreferencesSection,
} from './paths';

/** Marks a history entry the app pushed to open Preferences. */
interface OpenedHere {
  preferencesOpenedHere: true;
}

function openedHere(state: unknown): state is OpenedHere {
  return (
    typeof state === 'object' &&
    state !== null &&
    'preferencesOpenedHere' in state
  );
}

/** The current address's query with Preferences at `section`, or without it. */
function searchWith(
  search: string,
  section: PreferencesSection | undefined,
): string {
  const params = new URLSearchParams(search);

  if (section === undefined) {
    params.delete(PREFERENCES_PARAM);
  } else {
    params.set(PREFERENCES_PARAM, section);
  }

  const query = params.toString();

  return query ? `?${query}` : '';
}

export interface PreferencesRoute {
  /** The open section, or `undefined` while Preferences is closed. */
  section: PreferencesSection | undefined;
  /** Opens Preferences over the current view, as a new history entry. */
  open(section?: PreferencesSection): void;
  /** Shows another section, in place: Back still closes Preferences. */
  select(section: PreferencesSection): void;
  /**
   * Closes Preferences, back to the view behind it. Opened from the app, that
   * is the entry before; opened from a link, the same view without the query.
   */
  close(): void;
}

/**
 * Whether the Preferences dialog is open, and which section, from the
 * address. An unknown section opens General.
 */
export function usePreferencesRoute(): PreferencesRoute {
  const location = useLocation();
  const navigate = useNavigate();
  const raw = new URLSearchParams(location.search).get(PREFERENCES_PARAM);
  const section =
    raw === null
      ? undefined
      : (PREFERENCES_SECTIONS.find((known) => known === raw) ?? 'general');

  return {
    section,
    open: (next = 'general') => {
      void navigate(
        {
          pathname: location.pathname,
          search: searchWith(location.search, next),
        },
        { state: { preferencesOpenedHere: true } satisfies OpenedHere },
      );
    },
    select: (next) => {
      void navigate(
        {
          pathname: location.pathname,
          search: searchWith(location.search, next),
        },
        { replace: true, state: location.state },
      );
    },
    close: () => {
      if (openedHere(location.state)) {
        void navigate(-1);
      } else {
        void navigate(
          {
            pathname: location.pathname,
            search: searchWith(location.search, undefined),
          },
          { replace: true },
        );
      }
    },
  };
}
