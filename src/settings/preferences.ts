// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { SpeedUnit, TemperatureUnit } from '../units';

/** `system` follows the operating system's light or dark setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** A colour palette named after a NAS Defender factory paint. */
export type PalettePreference =
  'coniston' | 'arles' | 'alpine-beluga' | 'racing-green';

/** Whether the app may count visits and connections anonymously. */
export type UsageCountsPreference = 'on' | 'off';

export interface Preferences {
  temperatureUnit: TemperatureUnit;
  speedUnit: SpeedUnit;
  theme: ThemePreference;
  palette: PalettePreference;
  usageCounts: UsageCountsPreference;
}
