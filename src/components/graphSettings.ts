// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { METRIC_KEYS, type MetricKey } from '../metrics';
import { asRecord, oneOf } from '../storage/settings';

export const GRAPH_SETTINGS_KEY = 'graphs';

export const WINDOW_OPTIONS = [
  { seconds: 30, text: '30 s', name: '30 seconds' },
  { seconds: 60, text: '1 min', name: '1 minute' },
  { seconds: 300, text: '5 min', name: '5 minutes' },
  { seconds: 600, text: '10 min', name: '10 minutes' },
] as const;

export type WindowSeconds = (typeof WINDOW_OPTIONS)[number]['seconds'];

export interface GraphSettings {
  windowSeconds: WindowSeconds;
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
    windowSeconds: oneOf(
      s['windowSeconds'],
      WINDOW_OPTIONS.map((o) => o.seconds),
      60,
    ),
    hidden: METRIC_KEYS.filter((key) => hidden.includes(key)),
  };
}

export type DashboardView = 'overview' | 'graphs' | 'fuelMap';

export const DASHBOARD_VIEW_KEY = 'dashboardView';

export function parseDashboardView(stored: unknown): DashboardView {
  return oneOf(stored, ['overview', 'graphs', 'fuelMap'], 'overview');
}
