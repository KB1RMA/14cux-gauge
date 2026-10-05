// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';
import type { SpeedUnit, TemperatureUnit } from '../units';

/** `system` follows the operating system's light or dark setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

export interface Preferences {
  temperatureUnit: TemperatureUnit;
  speedUnit: SpeedUnit;
  theme: ThemePreference;
}

export interface PreferencesContextValue extends Preferences {
  setTemperatureUnit(unit: TemperatureUnit): void;
  setSpeedUnit(unit: SpeedUnit): void;
  setTheme(theme: ThemePreference): void;
}

export const PreferencesContext = createContext<
  PreferencesContextValue | undefined
>(undefined);
