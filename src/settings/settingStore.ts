// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { SettingsBackend } from '../platform/platform';
import { parseRawSetting, type SettingParser } from './parseSetting';
import { settingParser, type SettingKey, type SettingValue } from './registry';

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
   * The JSON the value was parsed from, as the backend's `read` gave it,
   * or {@link UNREAD} if the value must be read from storage again.
   */
  private raw: string | null | undefined | typeof UNREAD = UNREAD;
  private value: T | undefined;
  private unwatch: (() => void) | undefined;

  constructor(
    private readonly backend: SettingsBackend,
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
      this.raw = this.backend.read(this.key);
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
    this.raw = this.backend.write(this.key, value) ?? this.raw;
    this.value = value;
    this.notify();
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.listeners.size === 0) {
      this.unwatch = this.backend.watch(this.key, this.onChange);
      // Storage may have changed while nothing was listening.
      this.refresh();
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);

      if (this.listeners.size === 0) {
        this.unwatch?.();
        this.unwatch = undefined;
        // Nothing shows a value storage did not keep any more.
        this.raw = UNREAD;
      }
    };
  };

  /** Something else, such as another window, may have changed the setting. */
  private readonly onChange = (): void => {
    if (this.refresh()) {
      this.notify();
    }
  };

  /**
   * Takes up what storage now holds, if it has changed. Unreadable storage
   * keeps the value in use. Returns whether the value changed.
   */
  private refresh(): boolean {
    const raw = this.backend.read(this.key);

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

const registries = new WeakMap<
  SettingsBackend,
  Map<SettingKey, SettingStore<unknown>>
>();

/** The one store for the setting `key` kept in `backend`. */
export function settingStore<K extends SettingKey>(
  backend: SettingsBackend,
  key: K,
): SettingStore<SettingValue<K>> {
  let stores = registries.get(backend);

  if (!stores) {
    stores = new Map();
    registries.set(backend, stores);
  }

  let store = stores.get(key);

  if (!store) {
    store = new SettingStore<unknown>(
      backend,
      key,
      settingParser(key, backend.defaults()),
    );
    stores.set(key, store);
  }

  return store as SettingStore<SettingValue<K>>;
}
