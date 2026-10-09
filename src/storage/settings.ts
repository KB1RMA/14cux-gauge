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
 *
 * Every setting is listed in `src/settings/registry.ts`; components use them
 * through `useSetting`.
 */

const PREFIX = 'cuxGauge.';

/**
 * Turns a stored value of unknown shape into a valid setting. Return the
 * default for anything unrecognised; stored data may come from an older or
 * newer version of the app, or have been edited by hand.
 */
export type SettingParser<T> = (stored: unknown) => T;

/**
 * The JSON stored for a setting: `null` if there is none, or `undefined` if
 * storage cannot be read.
 */
export function readRawSetting(key: string): string | null | undefined {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return undefined;
  }
}

/**
 * Turns JSON from {@link readRawSetting} into a setting. `parse` receives
 * `undefined` if nothing usable is stored.
 */
export function parseRawSetting<T>(
  raw: string | null | undefined,
  parse: SettingParser<T>,
): T {
  let stored: unknown;

  try {
    stored = raw === null || raw === undefined ? undefined : JSON.parse(raw);
  } catch {
    stored = undefined;
  }

  return parse(stored);
}

/**
 * Saves a setting. Returns the JSON stored, or `undefined` if it could not
 * be stored.
 */
export function writeSetting(key: string, value: unknown): string | undefined {
  try {
    const raw = JSON.stringify(value);

    localStorage.setItem(PREFIX + key, raw);

    return raw;
  } catch {
    // Not remembered; the setting still applies for this visit.
    return undefined;
  }
}

/**
 * Whether a `storage` event, fired when another window changes storage, may
 * have changed the setting `key`. A `null` key means storage was cleared.
 */
export function affectsSetting(event: StorageEvent, key: string): boolean {
  try {
    if (event.storageArea !== localStorage) {
      return false;
    }
  } catch {
    return false;
  }

  return event.key === null || event.key === PREFIX + key;
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
