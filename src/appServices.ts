// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { BUILD_INFO } from './buildInfo';
import { ecuConnections } from './ecu/connect';
import { EcuSession, type EcuSessionOptions } from './ecu/session';
import type { Platform } from './platform/platform';
import {
  AppStatusStore,
  type AppStatusStoreOptions,
} from './pwa/appStatusStore';
import { defaultOptions } from './pwa/defaultOptions';

/**
 * The controllers and stores the app runs on, built once from a platform.
 * The providers in `App` only expose these; none builds its own.
 */
export interface AppServices {
  readonly platform: Platform;
  /** The ECU link, its poller, history and diagnostic log. */
  readonly session: EcuSession;
  /** Whether the app is offline, and whether a newer build is published. */
  readonly appStatus: AppStatusStore;
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
 * Builds the app's services on `platform`. Storage is opened later, by
 * `StorageProvider`, through `platform.storage`.
 */
export function createAppServices(
  platform: Platform,
  { pollIntervalMs, appStatus = defaultOptions() }: AppServicesOptions = {},
): AppServices {
  const session = new EcuSession({
    pollIntervalMs,
    createConnection: ecuConnections(platform.serial),
  });

  return {
    platform,
    session,
    appStatus: new AppStatusStore(
      appStatus ?? { build: BUILD_INFO, versionUrl: '' },
    ),
    checksAppStatus: appStatus !== undefined,
    dispose: () => {
      session.dispose();
    },
  };
}
