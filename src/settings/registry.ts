// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import { METRIC_KEYS } from '../metrics';
import {
  GAUGE_STYLE_PREFERENCES,
  PALETTE_PREFERENCES,
  THEME_PREFERENCES,
  USAGE_COUNTS_PREFERENCES,
} from './preferences';
import { dashReadings } from './dashSettings';
import { ownLimits } from './limitSettings';
import { ALWAYS_READ } from './readingSettings';
import { LAYOUT_OPTIONS, WINDOW_OPTIONS } from './graphSettings';
import type { SettingDefaults } from './settingDefaults';
import { SPEED_UNITS, TEMPERATURE_UNITS } from '../units';
import {
  choice,
  pickedFrom,
  settingObject,
  type SettingParser,
} from './parseSetting';

/**
 * Every setting the app stores, by key, as a schema that turns whatever is
 * stored into a valid value. A schema gives the setting's default when
 * nothing usable is stored. Stored values may come from an older or newer
 * version of the app, or have been edited by hand, so each schema accepts
 * the shapes earlier versions stored.
 *
 * A schema is made from the platform's defaults, so parsing reads no
 * browser globals.
 *
 * Read and change settings with `useSetting`.
 */

export const SETTINGS = {
  /** Units, theme, palette, gauge style, usage counts and keeping the screen on, chosen in Preferences. */
  preferences: (defaults: SettingDefaults) =>
    settingObject({
      temperatureUnit: choice(TEMPERATURE_UNITS, 'F'),
      speedUnit: choice(SPEED_UNITS, 'mph'),
      theme: choice(THEME_PREFERENCES, 'system'),
      palette: choice(PALETTE_PREFERENCES, 'coniston'),
      gaugeStyle: choice(GAUGE_STYLE_PREFERENCES, 'tiles'),
      // The platform's default applies until a choice is made in Preferences.
      usageCounts: choice(USAGE_COUNTS_PREFERENCES, defaults.usageCounts),
      keepScreenOn: z.catch(z.boolean(), false),
    }),
  /** Which readings are polled and recorded; every reading by default. */
  readings: () =>
    settingObject({
      // Never turns the MIL off.
      off: pickedFrom(METRIC_KEYS, (key) => !ALWAYS_READ.includes(key)),
    }),
  /** Which readings the Dash view shows. */
  dash: () => settingObject({ readings: dashReadings }),
  /**
   * The limits the user has set, by reading, chosen in Preferences; each
   * reading not listed uses its suggested limits.
   */
  limits: () => settingObject({ own: ownLimits }),
  /** The time window, layout and hidden graphs, live and in replay. */
  graphs: () =>
    settingObject(
      {
        window: choice(
          WINDOW_OPTIONS.map((o) => o.value),
          60,
        ),
        layout: choice(LAYOUT_OPTIONS, 'grid'),
        hidden: pickedFrom(METRIC_KEYS),
      },
      // Earlier versions stored the window as `windowSeconds`.
      (fields) => ({
        ...fields,
        window: fields['window'] ?? fields['windowSeconds'],
      }),
    ),
  /**
   * Whether to connect at double the usual serial speed; remembered, since
   * it matches the user's ECU and rarely changes.
   */
  doubleSpeed: () => z.catch(z.boolean(), false),
} as const;

export type SettingKey = keyof typeof SETTINGS;

export type SettingValue<K extends SettingKey> = z.output<
  ReturnType<(typeof SETTINGS)[K]>
>;

/** The parser for the setting `key`, with the platform's `defaults`. */
export function settingParser<K extends SettingKey>(
  key: K,
  defaults: SettingDefaults,
): SettingParser<SettingValue<K>> {
  const schema = SETTINGS[key](defaults) as unknown as z.ZodMiniType<
    SettingValue<K>
  >;

  return (stored) => schema.parse(stored);
}
