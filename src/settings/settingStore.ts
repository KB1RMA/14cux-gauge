// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  affectsSetting,
  parseRawSetting,
  readRawSetting,
  writeSetting,
  type SettingParser,
} from '../storage/settings';
import { SETTINGS, type SettingKey, type SettingValue } from './registry';

const UNREAD = Symbol('unread');

/**
 * One setting, shared by every component that uses it: an external store
 * for `useSyncExternalStore`.
 *
 * The value follows what storage holds, including changes made in another
 * window. If storage cannot be read, or refuses a change, the value last set
 * applies while the setting is in use, until storage holds something new;
 * once no component uses it, it is read from storage again.
 */
export class SettingStore<T> {
  private readonly listeners = new Set<() => void>();
  /**
   * The JSON the value was parsed from, as {@link readRawSetting} gave it,
   * or {@link UNREAD} if the value must be read from storage again.
   */
  private raw: string | null | undefined | typeof UNREAD = UNREAD;
  private value: T | undefined;

  constructor(
    private readonly key: string,
    private readonly parse: SettingParser<T>,
  ) {}

  /**
   * The current value; the same object until the setting changes. Cheap, as
   * React calls it on every render: storage is read only when the setting
   * comes into use and when another window changes it.
   */
  readonly get = (): T => {
    if (this.raw === UNREAD) {
      this.raw = readRawSetting(this.key);
      this.value = parseRawSetting(this.raw, this.parse);
    }

    return this.value as T;
  };

  /** Saves a new value, or one worked out from the current value. */
  readonly set = (next: T | ((previous: T) => T)): void => {
    const previous = this.get();
    const value =
      typeof next === 'function'
        ? (next as (previous: T) => T)(previous)
        : next;

    // If it is not stored, keep it until storage holds something else.
    this.raw = writeSetting(this.key, value) ?? this.raw;
    this.value = value;
    this.notify();
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.listeners.size === 0) {
      window.addEventListener('storage', this.onStorage);
      // Storage may have changed while nothing was listening.
      this.refresh();
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);

      if (this.listeners.size === 0) {
        window.removeEventListener('storage', this.onStorage);
        // Nothing shows a value storage did not keep any more.
        this.raw = UNREAD;
      }
    };
  };

  /** Another window changed storage. */
  private readonly onStorage = (event: StorageEvent): void => {
    if (affectsSetting(event, this.key) && this.refresh()) {
      this.notify();
    }
  };

  /**
   * Takes up what storage now holds, if it has changed. Unreadable storage
   * keeps the value in use. Returns whether the value changed.
   */
  private refresh(): boolean {
    const raw = readRawSetting(this.key);

    if (this.raw === UNREAD || raw === undefined || raw === this.raw) {
      return false;
    }

    this.raw = raw;
    this.value = parseRawSetting(raw, this.parse);

    return true;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

const stores = new Map<SettingKey, SettingStore<unknown>>();

/** The one store for the setting `key`. */
export function settingStore<K extends SettingKey>(
  key: K,
): SettingStore<SettingValue<K>> {
  let store = stores.get(key);

  if (!store) {
    store = new SettingStore<unknown>(key, SETTINGS[key]);
    stores.set(key, store);
  }

  return store as SettingStore<SettingValue<K>>;
}
