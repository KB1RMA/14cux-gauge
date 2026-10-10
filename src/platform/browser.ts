// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { WebSerialTransport } from '@kb1rma/libcomm14cux-ts';
import { openStorage } from '../storage/openStorage';
import type {
  FilePlatform,
  Platform,
  SerialPlatform,
  SerialPortHandle,
  SettingsBackend,
} from './platform';

const SETTING_PREFIX = 'cuxGauge.';

/**
 * The JSON stored for a setting: `null` if there is none, or `undefined` if
 * storage cannot be read (private windows, blocked site data).
 */
export function readRawSetting(key: string): string | null | undefined {
  try {
    return localStorage.getItem(SETTING_PREFIX + key);
  } catch {
    return undefined;
  }
}

/**
 * Saves a setting. Returns the JSON stored, or `undefined` if it could not
 * be stored (blocked storage, a full quota).
 */
export function writeSetting(key: string, value: unknown): string | undefined {
  try {
    const raw = JSON.stringify(value);

    localStorage.setItem(SETTING_PREFIX + key, raw);

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

  return event.key === null || event.key === SETTING_PREFIX + key;
}

/** Whether the browser sends Global Privacy Control or Do Not Track. */
export function browserAsksNotToTrack(nav: Navigator = navigator): boolean {
  const signals = nav as Navigator & { globalPrivacyControl?: boolean };

  return signals.globalPrivacyControl === true || signals.doNotTrack === '1';
}

/** The USB IDs of a port, which identify the adapter chip (FTDI, CH340…). */
export function describePort(port: SerialPort): string {
  // Test doubles and some platforms have no getInfo().
  const info = typeof port.getInfo === 'function' ? port.getInfo() : {};
  const hex = (id: number | undefined) =>
    id === undefined ? 'unknown' : `0x${id.toString(16).padStart(4, '0')}`;

  return `USB vendor ${hex(info.usbVendorId)}, product ${hex(info.usbProductId)}`;
}

/** A Web Serial port the user chose. */
class WebSerialPortHandle implements SerialPortHandle {
  readonly description: string;

  constructor(readonly port: SerialPort) {
    this.description = describePort(port);
  }
}

/** Serial ports through Web Serial, which also works in an Electron renderer. */
export const webSerial: SerialPlatform = {
  // Asked each time: the page cannot gain Web Serial later, but tests do.
  available: () => 'serial' in navigator,
  requestPort: async () =>
    new WebSerialPortHandle(await navigator.serial.requestPort()),
  open(handle, { baudRate }) {
    if (!(handle instanceof WebSerialPortHandle)) {
      throw new TypeError('That port did not come from Web Serial.');
    }

    const { port } = handle;

    return {
      transport: new WebSerialTransport(port, { baudRate }),
      onLost(listener) {
        const onDisconnect = () => {
          listener();
        };

        port.addEventListener('disconnect', onDisconnect);

        return () => {
          port.removeEventListener('disconnect', onDisconnect);
        };
      },
    };
  },
};

/** Saves files through the browser's normal download. */
export const browserDownloads: FilePlatform = {
  save(name, data, type) {
    const blob =
      typeof data === 'string'
        ? new Blob([data], { type: `${type};charset=utf-8` })
        : new Blob([data.slice()], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = name;
    link.click();
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1_000);

    // A browser download has no Save dialog the page can see.
    return Promise.resolve('saved');
  },
};

/**
 * Settings in `localStorage` under a `cuxGauge.` prefix, which an Electron
 * renderer has too. Storage can be missing or throw, so every access is
 * guarded: reads give `undefined` and failed writes are dropped.
 */
export const localStorageSettings: SettingsBackend = {
  defaults: () => ({
    // Off unless the user chooses otherwise in Preferences.
    usageCounts: browserAsksNotToTrack() ? 'off' : 'on',
  }),
  read: readRawSetting,
  write: writeSetting,
  watch(key, listener) {
    const onStorage = (event: StorageEvent) => {
      if (affectsSetting(event, key)) {
        listener();
      }
    };

    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
    };
  },
};

/**
 * The app as it runs in a browser: Web Serial, downloads, IndexedDB (or
 * memory without it) and `localStorage`. Pass `overrides` to swap a part.
 */
export function browserPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    serial: webSerial,
    files: browserDownloads,
    storage: { open: () => openStorage() },
    settings: localStorageSettings,
    ...overrides,
  };
}
