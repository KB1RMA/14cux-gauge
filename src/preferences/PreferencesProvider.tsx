// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import { browserAsksNotToTrack } from '../analytics/goatCounter';
import { asRecord, oneOf } from '../storage/settings';
import { useStoredState } from '../storage/useStoredState';
import type { SpeedUnit, TemperatureUnit } from '../units';
import {
  PreferencesContext,
  type PalettePreference,
  type Preferences,
  type ThemePreference,
  type UsageCountsPreference,
} from './context';

const STORAGE_KEY = 'preferences';

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

/** `theme.css` reads `data-theme` on the root element; no attribute follows the system. */
function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;

  if (theme === 'system') {
    delete root.dataset['theme'];
  } else {
    root.dataset['theme'] = theme;
  }
}

/** `theme.css` reads `data-palette` on the root element; no attribute is Coniston. */
function applyPalette(palette: PalettePreference): void {
  const root = document.documentElement;

  if (palette === 'coniston') {
    delete root.dataset['palette'];
  } else {
    root.dataset['palette'] = palette;
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

  useLayoutEffect(() => {
    applyPalette(preferences.palette);
  }, [preferences.palette]);

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
      setPalette: (palette: PalettePreference) => {
        setPreferences((p) => ({ ...p, palette }));
      },
      setUsageCounts: (usageCounts: UsageCountsPreference) => {
        setPreferences((p) => ({ ...p, usageCounts }));
      },
    }),
    [preferences, setPreferences],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}
