// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useSyncExternalStore } from 'react';
import type { SettingKey, SettingValue } from './registry';
import { settingStore } from './settingStore';

/**
 * Like `useState`, but for the stored setting `key` (see `registry.ts`).
 * Every component using the same key shares one value, and a change made in
 * another window shows here too. Without storage the value still works for
 * this visit.
 */
export function useSetting<K extends SettingKey>(
  key: K,
): [
  SettingValue<K>,
  (
    next: SettingValue<K> | ((previous: SettingValue<K>) => SettingValue<K>),
  ) => void,
] {
  const store = settingStore(key);

  return [useSyncExternalStore(store.subscribe, store.get), store.set];
}
