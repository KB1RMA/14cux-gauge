// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type {
  GaugeStylePreference,
  Preferences,
  PalettePreference,
  ThemePreference,
  UsageCountsPreference,
} from '../settings/preferences';
import type { OwnLimits } from '../settings/limitSettings';
import type { SpeedUnit, TemperatureUnit } from '../units';

export interface PreferencesContextValue extends Preferences {
  setTemperatureUnit(unit: TemperatureUnit): void;
  setSpeedUnit(unit: SpeedUnit): void;
  setTheme(theme: ThemePreference): void;
  setPalette(palette: PalettePreference): void;
  setGaugeStyle(gaugeStyle: GaugeStylePreference): void;
  setUsageCounts(usageCounts: UsageCountsPreference): void;
  setKeepScreenOn(keepScreenOn: boolean): void;
  /**
   * The limits the user has set, by reading, in library units; readings not
   * listed use their suggestions (see `limitsFor`).
   */
  ownLimits: OwnLimits;
  setOwnLimits(ownLimits: OwnLimits): void;
}

export const PreferencesContext = createContext<
  PreferencesContextValue | undefined
>(undefined);
