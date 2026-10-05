// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import { asRecord, oneOf } from '../storage/settings';
import { useStoredState } from '../storage/useStoredState';
import type { SpeedUnit, TemperatureUnit } from '../units';
import {
  PreferencesContext,
  type Preferences,
  type ThemePreference,
} from './context';

const STORAGE_KEY = 'preferences';

function parsePreferences(stored: unknown): Preferences {
  const p = asRecord(stored);

  return {
    temperatureUnit: oneOf(p['temperatureUnit'], ['F', 'C'], 'F'),
    speedUnit: oneOf(p['speedUnit'], ['mph', 'kmh'], 'mph'),
    theme: oneOf(p['theme'], ['system', 'light', 'dark'], 'system'),
  };
}

/** `theme.css` reads `data-theme` on the root element; no attribute follows the system. */
function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;

  if (theme === 'system') {
    delete root.dataset['theme'];
  } else {
    root.dataset['theme'] = theme;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useStoredState(
    STORAGE_KEY,
    parsePreferences,
  );

  // Before paint, so a stored theme does not flash the system one first.
  useLayoutEffect(() => {
    applyTheme(preferences.theme);
  }, [preferences.theme]);

  const value = useMemo(
    () => ({
      ...preferences,
      setTemperatureUnit: (temperatureUnit: TemperatureUnit) => {
        setPreferences((p) => ({ ...p, temperatureUnit }));
      },
      setSpeedUnit: (speedUnit: SpeedUnit) => {
        setPreferences((p) => ({ ...p, speedUnit }));
      },
      setTheme: (theme: ThemePreference) => {
        setPreferences((p) => ({ ...p, theme }));
      },
    }),
    [preferences, setPreferences],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}
