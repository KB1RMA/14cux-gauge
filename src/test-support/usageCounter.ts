// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { UsageCounter } from '../usage/goatCounter';

/** A usage counter that records what the app counts, for assertions. */
export function fakeUsageCounter() {
  const counter = { start: vi.fn(), count: vi.fn() };

  return counter satisfies UsageCounter;
}
