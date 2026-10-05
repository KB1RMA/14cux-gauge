// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SpeedUnit, TemperatureUnit } from '../units';
import {
  PreferencesContext,
  type PalettePreference,
  type Preferences,
  type ThemePreference,
} from './context';

const STORAGE_KEY = 'cuxGauge.preferences';
const DEFAULTS: Preferences = {
  temperatureUnit: 'F',
  speedUnit: 'mph',
  theme: 'system',
  palette: 'coniston',
};

const PALETTES: readonly PalettePreference[] = [
  'coniston',
  'arles',
  'alpine-beluga',
  'racing-green',
];

function parseTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function parsePalette(value: unknown): PalettePreference {
  return PALETTES.find((palette) => palette === value) ?? 'coniston';
}

// Storage can be missing or throw (private windows, blocked site data), so
// every access is guarded and the defaults always work.
function load(): Preferences {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '{}',
    );

    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULTS;
    }

    const stored = parsed as Partial<Record<keyof Preferences, unknown>>;

    return {
      temperatureUnit: stored.temperatureUnit === 'C' ? 'C' : 'F',
      speedUnit: stored.speedUnit === 'kmh' ? 'kmh' : 'mph',
      theme: parseTheme(stored.theme),
      palette: parsePalette(stored.palette),
    };
  } catch {
    return DEFAULTS;
  }
}

function save(preferences: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Not remembered; the setting still applies for this visit.
  }
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
  const [preferences, setPreferences] = useState(load);

  useEffect(() => {
    save(preferences);
  }, [preferences]);

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
    }),
    [preferences],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}
