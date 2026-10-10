// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type {
  Preferences,
  PalettePreference,
  ThemePreference,
  UsageCountsPreference,
} from '../settings/preferences';
import type { SpeedUnit, TemperatureUnit } from '../units';

export interface PreferencesContextValue extends Preferences {
  setTemperatureUnit(unit: TemperatureUnit): void;
  setSpeedUnit(unit: SpeedUnit): void;
  setTheme(theme: ThemePreference): void;
  setPalette(palette: PalettePreference): void;
  setUsageCounts(usageCounts: UsageCountsPreference): void;
}

export const PreferencesContext = createContext<
  PreferencesContextValue | undefined
>(undefined);
