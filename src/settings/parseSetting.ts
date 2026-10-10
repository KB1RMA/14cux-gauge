// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import { fieldsOf } from '../model/record';

/**
 * Turns a stored value of unknown shape into a valid setting. Gives the
 * default for anything unrecognised; stored data may come from an older or
 * newer version of the app, or have been edited by hand.
 */
export type SettingParser<T> = (stored: unknown) => T;

/**
 * Turns JSON from a settings backend into a setting. `parse` receives
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
 * A setting stored as an object: `shape` gives each field a catch-default,
 * so a missing or unrecognised field takes its default on its own, and
 * anything that is not an object gives every default. `upgrade` may rename
 * fields an earlier version stored.
 */
export function settingObject<T extends z.core.$ZodLooseShape>(
  shape: T,
  upgrade: (fields: Record<string, unknown>) => Record<string, unknown> = (
    fields,
  ) => fields,
) {
  return z.pipe(
    z.transform((stored: unknown) => upgrade(fieldsOf(stored))),
    z.object(shape),
  );
}

/** A choice from `options`, or `fallback` for anything else. */
export function choice<const T extends string | number>(
  options: readonly T[],
  fallback: T,
) {
  return z.catch(z.literal(options), fallback);
}

/** A list of the `known` values found in what is stored, in `known`'s order. */
export function pickedFrom<const T extends string>(
  known: readonly T[],
  allowed: (value: T) => boolean = () => true,
) {
  return z.pipe(
    z.catch(z.array(z.unknown()), []),
    z.transform((stored) =>
      known.filter((value) => stored.includes(value) && allowed(value)),
    ),
  );
}
