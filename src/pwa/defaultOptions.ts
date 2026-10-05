// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { BUILD_INFO } from '../buildInfo';
import type { AppStatusStoreOptions } from './appStatusStore';

/**
 * The offline copy and the published build only exist in a production build
 * served over http(s); the dev server, tests and a file:// page (Electron)
 * get a store that reports online and up to date.
 */
export function defaultOptions(): AppStatusStoreOptions | undefined {
  if (!import.meta.env.PROD || !/^https?:$/.test(location.protocol)) {
    return undefined;
  }

  const resolve = (file: string) =>
    new URL(`${import.meta.env.BASE_URL}${file}`, location.href).href;

  return {
    build: BUILD_INFO,
    versionUrl: resolve('version.json'),
    ...('serviceWorker' in navigator
      ? {
          serviceWorker: navigator.serviceWorker,
          serviceWorkerUrl: resolve('sw.js'),
        }
      : {}),
  };
}
