// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { onTestFinished, vi } from 'vitest';
import { servicesOn, type AppServices } from '../appServices';
import type { EcuSession } from '../ecu/session';
import type { Platform } from '../platform/platform';
import { testPlatform } from './platform';

/**
 * The app's controllers on `session`, with no React: for tests that drive
 * them as the views would. Waits for the storage to open, and ends the
 * services (and the session) when the test finishes.
 */
export async function controllersOn(
  session: EcuSession,
  platform: Platform = testPlatform(),
): Promise<AppServices> {
  const services = servicesOn(platform, session);

  onTestFinished(() => {
    services.dispose();
  });
  await vi.waitFor(() => {
    expect(services.storage.getSnapshot()).toBeDefined();
  });

  return services;
}
