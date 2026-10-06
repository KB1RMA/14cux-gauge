// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * The address of every screen. The router keeps them in the URL's fragment
 * (`#/live/graphs`), which works from any static host and a file:// URL.
 * Preferences and filters are not part of an address.
 */
export type LiveTab = 'overview' | 'graphs' | 'fuelMap';
export type ReplayTab = 'readings' | 'graphs';

export const LIVE_PATH = '/live';
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
