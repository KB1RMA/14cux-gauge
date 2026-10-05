// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
  delete document.documentElement.dataset['palette'];
});

// jsdom does no layout, so it leaves out APIs that Radix's positioned
// popups (the Preferences menu) call. These no-op stand-ins only let them
// mount; nothing in the tests depends on where a popup is drawn.
/* eslint-disable @typescript-eslint/no-unnecessary-condition -- feature detection: jsdom leaves these undefined despite the DOM types */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

Element.prototype.scrollIntoView ??= function scrollIntoView() {};

Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
  return false;
};

Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};
/* eslint-enable @typescript-eslint/no-unnecessary-condition */
