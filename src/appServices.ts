// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { BUILD_INFO } from './buildInfo';
import { ecuConnections } from './ecu/connect';
import { EcuSession, type EcuSessionOptions } from './ecu/session';
import { EcuWrites } from './ecuWrite/ecuWrites';
import type { Platform } from './platform/platform';
import { Recorder } from './recording/recorder';
import { RomReader } from './roms/romReader';
import { StorageService } from './storage/storageService';
import {
  AppStatusStore,
  type AppStatusStoreOptions,
} from './pwa/appStatusStore';
import { defaultOptions } from './pwa/defaultOptions';

/**
 * The controllers and stores the app runs on, built once from a platform.
 * Each is plain TypeScript with `subscribe` / `getSnapshot`, which React
 * reads through `useSyncExternalStore` and tests drive without rendering.
 * `ServicesProvider` only exposes them; none is built or ended by a view.
 */
export interface AppServices {
  readonly platform: Platform;
  /** The ECU link, its poller, history and diagnostic log. */
  readonly session: EcuSession;
  /** Whether the app is offline, and whether a newer build is published. */
  readonly appStatus: AppStatusStore;
  /** The sessions and ROM image stores, once open. */
  readonly storage: StorageService;
  /** Writes to the ECU, and how each went. */
  readonly writes: EcuWrites;
  /** Recording live readings and writes into a session. */
  readonly recorder: Recorder;
  /** Reading the ROM image, and the images kept. */
  readonly roms: RomReader;
  /**
   * Whether `appStatus` checks the network and the published build; off
   * outside a production build, where it reports online and up to date.
   */
  readonly checksAppStatus: boolean;
  /** Closes the ECU connection, as on unload. */
  dispose(): void;
}

export interface AppServicesOptions {
  /** Pause between polling passes for each connection kind, in milliseconds. */
  pollIntervalMs?: EcuSessionOptions['pollIntervalMs'];
  /** Replaces the offline and update checks' defaults (see `defaultOptions`). */
  appStatus?: AppStatusStoreOptions | undefined;
}

/**
 * Builds the app's services on `platform`, with the ECU link on `session`
 * (a test's own, or `createAppServices`'s).
 */
export function servicesOn(
  platform: Platform,
  session: EcuSession,
  { appStatus = defaultOptions() }: Pick<AppServicesOptions, 'appStatus'> = {},
): AppServices {
  const storage = new StorageService(platform.storage.open);
  const writes = new EcuWrites(session);
  const recorder = new Recorder(session, writes, storage);
  const roms = new RomReader(session, storage, recorder, platform.files);

  return {
    platform,
    session,
    storage,
    writes,
    recorder,
    roms,
    appStatus: new AppStatusStore(
      appStatus ?? { build: BUILD_INFO, versionUrl: '' },
    ),
    checksAppStatus: appStatus !== undefined,
    dispose: () => {
      // Recording keeps what it has, and the storage stays open until that is
      // saved: closing it first would lose the last samples.
      const recorded = recorder.dispose();

      roms.dispose();
      session.dispose();
      void recorded.finally(() => {
        storage.dispose();
      });
    },
  };
}

/**
 * Builds the app's services on `platform`. Storage is opened at once,
 * through `platform.storage`.
 */
export function createAppServices(
  platform: Platform,
  { pollIntervalMs, appStatus }: AppServicesOptions = {},
): AppServices {
  const session = new EcuSession({
    pollIntervalMs,
    createConnection: ecuConnections(platform.serial),
  });

  return servicesOn(platform, session, { appStatus });
}
