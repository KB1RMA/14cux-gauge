// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import type { Limits } from '../model/limits';
import { withLimits, type LimitMetric } from '../settings/limitSettings';
import type {
  GaugeStylePreference,
  PalettePreference,
  ThemePreference,
  UsageCountsPreference,
} from '../settings/preferences';
import { useSetting } from '../settings/useSetting';
import type { SpeedUnit, TemperatureUnit } from '../units';
import { PreferencesContext } from './context';

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
  const [preferences, setPreferences] = useSetting('preferences');
  const [{ own: ownLimits }, setLimits] = useSetting('limits');

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
      setGaugeStyle: (gaugeStyle: GaugeStylePreference) => {
        setPreferences((p) => ({ ...p, gaugeStyle }));
      },
      setUsageCounts: (usageCounts: UsageCountsPreference) => {
        setPreferences((p) => ({ ...p, usageCounts }));
      },
      setKeepScreenOn: (keepScreenOn: boolean) => {
        setPreferences((p) => ({ ...p, keepScreenOn }));
      },
      ownLimits,
      setReadingLimits: (metric: LimitMetric, limits: Limits) => {
        // From the stored value, not this render's, so a change made since
        // (in another window, or to another reading) is kept.
        setLimits(({ own }) => ({ own: withLimits(own, metric, limits) }));
      },
    }),
    [preferences, setPreferences, ownLimits, setLimits],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}
