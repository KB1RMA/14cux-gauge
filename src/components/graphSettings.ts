// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { METRIC_KEYS, type MetricKey } from '../metrics';
import { asRecord, oneOf } from '../storage/settings';

export const GRAPH_SETTINGS_KEY = 'graphs';

/**
 * The live graphs' time windows: a number of seconds back from the newest
 * sample, or the whole session since connecting.
 */
export const WINDOW_OPTIONS = [
  { value: 30, text: '30 s', name: '30 seconds' },
  { value: 60, text: '1 min', name: '1 minute' },
  { value: 300, text: '5 min', name: '5 minutes' },
  { value: 600, text: '10 min', name: '10 minutes' },
  { value: 'session', text: 'Session', name: 'Whole session' },
] as const;

export type GraphWindow = (typeof WINDOW_OPTIONS)[number]['value'];

export const LAYOUT_OPTIONS = ['grid', 'stacked'] as const;

/** Graphs side by side in a grid, or each the full width, one under another. */
export type GraphLayout = (typeof LAYOUT_OPTIONS)[number];

export interface GraphSettings {
  window: GraphWindow;
  layout: GraphLayout;
  /**
   * Graphs the user has turned off in session replay. (Live graphs show the
   * chosen readings instead.) Stored this way round so a metric added in a
   * later version shows up by default.
   */
  hidden: MetricKey[];
}

export function parseGraphSettings(stored: unknown): GraphSettings {
  const s = asRecord(stored);
  const hidden = Array.isArray(s['hidden']) ? (s['hidden'] as unknown[]) : [];

  return {
    // Earlier versions stored the window as `windowSeconds`.
    window: oneOf<GraphWindow>(
      s['window'] ?? s['windowSeconds'],
      WINDOW_OPTIONS.map((o) => o.value),
      60,
    ),
    layout: oneOf<GraphLayout>(s['layout'], LAYOUT_OPTIONS, 'grid'),
    hidden: METRIC_KEYS.filter((key) => hidden.includes(key)),
  };
}
