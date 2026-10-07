// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';

// Many tests drive the app against the demo or a simulated ECU in real time,
// which is slow on a busy CI runner. Wait long enough that a slow runner never
// fails a test that is right; a wait that succeeds still returns at once.
configure({ asyncUtilTimeout: 10_000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = '';
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

Element.prototype.setPointerCapture ??= function setPointerCapture() {};
/* eslint-enable @typescript-eslint/no-unnecessary-condition */
