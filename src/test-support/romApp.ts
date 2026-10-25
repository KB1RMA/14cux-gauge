// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { browserPlatform } from '../platform/browser';
import type { FilePlatform } from '../platform/platform';
import { MemoryRomStore, type RomStore } from '../storage/romStore';
import { storageWith } from './storage';
import { TestApp } from './TestApp';
import { fakeUsageCounter } from './usageCounter';

/** Records what the page offers for download. */
export function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];

  URL.createObjectURL = (blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);

    return 'blob:rom';
  };

  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });

  return { blobs, names };
}

/** Renders the app, keeping ROM images in `store` and saving to `files`. */
export function renderApp(
  store: RomStore = new MemoryRomStore(),
  files?: FilePlatform,
) {
  return render(
    createElement(TestApp, {
      pollIntervalMs: { demo: 10 },
      usageCounter: fakeUsageCounter(),
      platform: browserPlatform({
        storage: { open: storageWith({ roms: store }) },
        ...(files ? { files } : {}),
      }),
    }),
  );
}
