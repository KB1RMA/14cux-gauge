// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * Small, synchronous settings (preferences, view state), kept as JSON in
 * `localStorage` under a `cuxGauge.` prefix. `localStorage` also works in an
 * Electron renderer, so the desktop app can use this module unchanged.
 *
 * Storage can be missing or throw (private windows, blocked site data, a full
 * quota), so every access is guarded: reads fall back to the caller's default
 * and failed writes are dropped. The app must work without storage.
 */

const PREFIX = 'cuxGauge.';

/**
 * Turns a stored value of unknown shape into a valid setting. Return the
 * default for anything unrecognised; stored data may come from an older or
 * newer version of the app, or have been edited by hand.
 */
export type SettingParser<T> = (stored: unknown) => T;

/** Reads a setting. `parse` receives `undefined` if nothing usable is stored. */
export function readSetting<T>(key: string, parse: SettingParser<T>): T {
  let stored: unknown;

  try {
    const raw = localStorage.getItem(PREFIX + key);

    stored = raw === null ? undefined : JSON.parse(raw);
  } catch {
    stored = undefined;
  }

  return parse(stored);
}

/** Saves a setting. Returns whether it was stored. */
export function writeSetting(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));

    return true;
  } catch {
    // Not remembered; the setting still applies for this visit.
    return false;
  }
}

export function removeSetting(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to remove if storage is unavailable.
  }
}

/** Treats a stored value as a plain object, or an empty one if it is not. */
export function asRecord(stored: unknown): Record<string, unknown> {
  return typeof stored === 'object' && stored !== null && !Array.isArray(stored)
    ? (stored as Record<string, unknown>)
    : {};
}

/** Returns `stored` if it is one of `options`, else `fallback`. */
export function oneOf<const T extends string | number>(
  stored: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return options.find((option) => option === stored) ?? fallback;
}
