// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * The address of every screen. The router keeps them in the URL's fragment
 * (`#/live/graphs`), which works from any static host and a file:// URL.
 * Preference values and filters are not part of an address; only which
 * section of the Preferences dialog is open, if it is (see below).
 */
export type LiveTab = 'overview' | 'graphs' | 'fuelMap';
export type ReplayTab = 'readings' | 'graphs';

export const LIVE_PATH = '/live';
export const DASH_PATH = '/dash';
export const SESSIONS_PATH = '/sessions';

export const LIVE_TAB_PATHS: Record<LiveTab, string> = {
  overview: LIVE_PATH,
  graphs: `${LIVE_PATH}/graphs`,
  fuelMap: `${LIVE_PATH}/fuel-map`,
};

export function sessionPath(id: string, tab: ReplayTab = 'readings'): string {
  const base = `${SESSIONS_PATH}/${encodeURIComponent(id)}`;

  return tab === 'graphs' ? `${base}/graphs` : base;
}

/**
 * The Preferences dialog opens over whichever view is showing, so it is a
 * query on that view's address rather than a path of its own:
 * `#/live/graphs?preferences=limits`.
 */
export const PREFERENCES_PARAM = 'preferences';

export const PREFERENCES_SECTIONS = [
  'general',
  'appearance',
  'limits',
] as const;

export type PreferencesSection = (typeof PREFERENCES_SECTIONS)[number];
