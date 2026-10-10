// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useState, type ReactNode } from 'react';
import { App, type AppProps } from '../App';
import {
  createAppServices,
  type AppServices,
  type AppServicesOptions,
} from '../appServices';
import { EcuProvider } from '../ecu/EcuProvider';
import { browserPlatform } from '../platform/browser';
import { PlatformContext } from '../platform/context';
import type { Platform } from '../platform/platform';
import { testPlatform } from './platform';

/**
 * Services built on `platform` for as long as the component is mounted, as
 * `main.tsx` builds them for the app; disposed on unmount.
 */
function useTestServices(
  platform: Platform,
  options: AppServicesOptions,
): AppServices {
  const [services] = useState(() => createAppServices(platform, options));

  useEffect(
    () => () => {
      services.dispose();
    },
    [services],
  );

  return services;
}

export interface TestAppProps
  extends AppServicesOptions, Pick<AppProps, 'usageCounter'> {
  /**
   * Where the app runs; defaults to the browser's, which the web build's
   * tests exercise through `localStorage` and a fake `navigator.serial`.
   */
  platform?: Platform;
}

/** The whole app, on services built here for the test. */
export function TestApp({
  platform,
  pollIntervalMs,
  appStatus,
  usageCounter,
}: TestAppProps) {
  const services = useTestServices(platform ?? browserPlatform(), {
    pollIntervalMs,
    appStatus,
  });

  return <App services={services} usageCounter={usageCounter} />;
}

/**
 * Views under test that need the platform and the ECU session, on services
 * built here: `children` is rendered inside `PlatformContext` and
 * `EcuProvider`.
 */
export function TestServices({
  platform,
  pollIntervalMs,
  children,
}: {
  platform?: Platform;
  pollIntervalMs?: AppServicesOptions['pollIntervalMs'];
  children: ReactNode;
}) {
  const services = useTestServices(platform ?? testPlatform(), {
    pollIntervalMs,
  });

  return (
    <PlatformContext value={services.platform}>
      <EcuProvider session={services.session}>{children}</EcuProvider>
    </PlatformContext>
  );
}

/**
 * Views under test that need only the platform (settings, files), on
 * `testPlatform()` unless `platform` says otherwise.
 */
export function TestPlatform({
  platform,
  children,
}: {
  platform?: Platform;
  children: ReactNode;
}) {
  const [provided] = useState(() => platform ?? testPlatform());

  return <PlatformContext value={provided}>{children}</PlatformContext>;
}
