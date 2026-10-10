// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { SpeedUnit, TemperatureUnit } from '../units';

/** The stored schemas and these types share one list, so they cannot drift. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

/** `system` follows the operating system's light or dark setting. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Colour palettes, each named after a NAS Defender factory paint. */
export const PALETTE_PREFERENCES = [
  'coniston',
  'arles',
  'alpine-beluga',
  'racing-green',
] as const;

export type PalettePreference = (typeof PALETTE_PREFERENCES)[number];

export const USAGE_COUNTS_PREFERENCES = ['on', 'off'] as const;

/** Whether the app may count visits and connections anonymously. */
export type UsageCountsPreference = (typeof USAGE_COUNTS_PREFERENCES)[number];

export interface Preferences {
  temperatureUnit: TemperatureUnit;
  speedUnit: SpeedUnit;
  theme: ThemePreference;
  palette: PalettePreference;
  usageCounts: UsageCountsPreference;
}
