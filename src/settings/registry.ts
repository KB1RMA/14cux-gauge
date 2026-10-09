// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  LAYOUT_OPTIONS,
  WINDOW_OPTIONS,
  type GraphLayout,
  type GraphSettings,
  type GraphWindow,
} from '../components/graphSettings';
import { METRIC_KEYS } from '../metrics';
import type { PalettePreference, Preferences } from '../preferences/context';
import { ALWAYS_READ, type ReadingSettings } from '../readings/readingSettings';
import { asRecord, oneOf, type SettingParser } from '../storage/settings';
import { browserAsksNotToTrack } from '../usage/goatCounter';

/**
 * Every setting the app stores, by key, with the parser that turns whatever
 * is stored into a valid value. A parser gives the setting's default when
 * nothing usable is stored. Stored values may come from an older or newer
 * version of the app, or have been edited by hand, so each parser accepts
 * the shapes earlier versions stored.
 *
 * Read and change settings with `useSetting`.
 */

const PALETTES = [
  'coniston',
  'arles',
  'alpine-beluga',
  'racing-green',
] as const satisfies readonly PalettePreference[];

function parsePreferences(stored: unknown): Preferences {
  const p = asRecord(stored);

  return {
    temperatureUnit: oneOf(p['temperatureUnit'], ['F', 'C'], 'F'),
    speedUnit: oneOf(p['speedUnit'], ['mph', 'kmh'], 'mph'),
    theme: oneOf(p['theme'], ['system', 'light', 'dark'], 'system'),
    palette: oneOf(p['palette'], PALETTES, 'coniston'),
    // Off by default if the browser asks sites not to track; a choice made
    // in Preferences overrides that.
    usageCounts: oneOf(
      p['usageCounts'],
      ['on', 'off'],
      browserAsksNotToTrack() ? 'off' : 'on',
    ),
  };
}

function parseReadingSettings(stored: unknown): ReadingSettings {
  const s = asRecord(stored);
  const off = Array.isArray(s['off']) ? (s['off'] as unknown[]) : [];

  // Every reading by default.
  return {
    off: METRIC_KEYS.filter(
      (key) => off.includes(key) && !ALWAYS_READ.includes(key),
    ),
  };
}

function parseGraphSettings(stored: unknown): GraphSettings {
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

function parseDoubleSpeed(stored: unknown): boolean {
  return stored === true;
}

export const SETTINGS = {
  /** Units, theme, palette and usage counts, chosen in Preferences. */
  preferences: parsePreferences,
  /** Which readings are polled and recorded. */
  readings: parseReadingSettings,
  /** The time window, layout and hidden graphs, live and in replay. */
  graphs: parseGraphSettings,
  /**
   * Whether to connect at double the usual serial speed; remembered, since
   * it matches the user's ECU and rarely changes.
   */
  doubleSpeed: parseDoubleSpeed,
} as const satisfies Record<string, SettingParser<unknown>>;

export type SettingKey = keyof typeof SETTINGS;

export type SettingValue<K extends SettingKey> = ReturnType<
  (typeof SETTINGS)[K]
>;
