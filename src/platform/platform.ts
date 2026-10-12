// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Transport } from '@kb1rma/libcomm14cux-ts';
import type { SettingDefaults } from '../settings/settingDefaults';
import type { AppStorage } from '../storage/openStorage';

/**
 * Everything the app needs from where it runs: serial ports, saving files,
 * storage for sessions and ROM images, small settings, and restarting. The
 * browser build uses `browserPlatform()`; a desktop build can supply its own
 * (a serial port in the main process over IPC, a native Save dialog, files on
 * disk) without changing the views.
 *
 * Every part must be plain web code: no Node APIs in `src/`.
 */
export interface Platform {
  serial: SerialPlatform;
  files: FilePlatform;
  storage: StoragePlatform;
  settings: SettingsBackend;
  app: AppPlatform;
  screen: ScreenPlatform;
}

/**
 * A serial port the user chose. The app keeps it to reconnect and never
 * looks inside: only the platform that gave it out can open it.
 */
export interface SerialPortHandle {
  /** Identifies the adapter for the diagnostic log, such as its USB IDs. */
  readonly description: string;
}

/** An open path to a serial port, before the ECU protocol starts on it. */
export interface SerialLink {
  /** The bytes to and from the port; the ECU opens and closes it. */
  readonly transport: Transport;
  /**
   * Calls `listener` if the port goes away outside of the ECU protocol (the
   * USB cable is unplugged). Returns an unsubscribe function.
   */
  onLost(listener: () => void): () => void;
}

export interface SerialPlatform {
  /** Whether serial ports can be used here at all. */
  available(): boolean;
  /**
   * Asks the user to choose a port. Rejects with a `NotFoundError`
   * `DOMException` if they dismiss the picker (see `isPortPickerCancelled`).
   */
  requestPort(): Promise<SerialPortHandle>;
  /**
   * The ports the user has already allowed this app to use, which can be
   * opened without the picker. Empty where the platform cannot tell.
   */
  grantedPorts(): Promise<SerialPortHandle[]>;
  /** A link to `port` at `baudRate`, 8N1, without flow control. */
  open(port: SerialPortHandle, options: { baudRate: number }): SerialLink;
}

/**
 * How a save ended: `saved` once the file has been handed over (a browser
 * download has started), `cancelled` if the user dismissed a Save dialog.
 */
export type SaveResult = 'saved' | 'cancelled';

export interface FilePlatform {
  /**
   * Offers `data` to the user as a file named `name`, of MIME type `type`;
   * text is saved as UTF-8. Rejects if the file could not be saved. Callers
   * must tell the user when it was not saved, either way.
   */
  save(
    name: string,
    data: string | Uint8Array,
    type: string,
  ): Promise<SaveResult>;
}

export interface AppPlatform {
  /**
   * Names the browser or shell the app runs in, for the diagnostic report
   * (the browser's user agent).
   */
  readonly userAgent: string;
  /**
   * Restarts the app, as reloading the page does: the ECU connection and any
   * recording end. A function, not a method: it is passed on and called on
   * its own.
   */
  reload: () => void;
}

export interface StoragePlatform {
  /**
   * Opens where recorded sessions and ROM images are kept. A function, not
   * a method: it is passed on and called on its own.
   */
  open: () => Promise<AppStorage>;
}

/**
 * Where small settings are kept, as JSON by key. Reads are synchronous, as
 * React reads settings while rendering. Storage may be missing or refuse a
 * write; the app must still work.
 */
export interface SettingsBackend {
  /**
   * What a setting is when the user has not chosen, where that depends on
   * the platform (such as the browser's privacy signals).
   */
  defaults(): SettingDefaults;
  /** The JSON stored for `key`: `null` if none, `undefined` if unreadable. */
  read(key: string): string | null | undefined;
  /** Saves `value`; returns the JSON stored, or `undefined` if it was not. */
  write(key: string, value: unknown): string | undefined;
  /**
   * Calls `listener` when something else (another window) may have changed
   * `key`. Returns an unsubscribe function.
   */
  watch(key: string, listener: () => void): () => void;
}

/** A screen wake lock that has been granted. */
export interface WakeLockHold {
  /** Lets the screen sleep again. Does nothing if it has been released. */
  release(): Promise<void>;
  /**
   * Calls `listener` when the lock ends without `release` being called (the
   * page was hidden, or the system took it back). Returns an unsubscribe
   * function.
   */
  onReleased(listener: () => void): () => void;
}

export interface WakeLockPlatform {
  /** Whether the screen can be kept on here at all. */
  available(): boolean;
  /**
   * Asks to keep the screen on. Rejects if the system refuses (low battery,
   * a hidden page).
   */
  request(): Promise<WakeLockHold>;
  /**
   * Calls `listener` when the page becomes visible again, which is when a
   * lock the system took back can be asked for again. Returns an
   * unsubscribe function.
   */
  onVisible(listener: () => void): () => void;
}

export interface FullscreenPlatform {
  /** Whether the app can be shown full screen here at all. */
  available(): boolean;
  /** Whether the app is full screen now. */
  active(): boolean;
  /**
   * Goes full screen. Must be called from a user's action; rejects if the
   * browser refuses.
   */
  enter(): Promise<void>;
  exit(): Promise<void>;
  /**
   * Calls `listener` when `active()` may have changed, including when the
   * user leaves full screen with the Escape key. Returns an unsubscribe
   * function.
   */
  watch(listener: () => void): () => void;
}

/** What the app asks of the screen it is shown on. */
export interface ScreenPlatform {
  wakeLock: WakeLockPlatform;
  fullscreen: FullscreenPlatform;
}
