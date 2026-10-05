// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useState } from 'react';
import { readSetting, writeSetting, type SettingParser } from './settings';

/**
 * Like `useState`, but the value is loaded from and saved to the settings
 * store under `key`. `parse` validates whatever is stored and supplies the
 * default. Without storage the value still works for this visit.
 */
export function useStoredState<T>(
  key: string,
  parse: SettingParser<T>,
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState(() => readSetting(key, parse));

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved =
          typeof next === 'function'
            ? (next as (previous: T) => T)(previous)
            : next;

        writeSetting(key, resolved);

        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}
