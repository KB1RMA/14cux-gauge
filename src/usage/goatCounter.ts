// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { UsageEvent } from './events';

/**
 * Anonymous usage counts, kept with GoatCounter (https://www.goatcounter.com):
 * no cookies and nothing personal, only that the page was visited and the
 * events in `events.ts`. Readings, fault codes, serial traffic and error
 * messages are never sent.
 *
 * Counting runs only on the published site, so development, test and
 * self-hosted copies send nothing. The script is loaded from GoatCounter
 * rather than bundled, and the user can turn counting off in Preferences.
 */

/** Where the published app is served from (GitHub Pages). */
export const SITE_ORIGIN = 'https://kb1rma.github.io';
export const COUNTER_ENDPOINT = 'https://14cux-gauge.goatcounter.com/count';
export const COUNTER_SCRIPT = 'https://gc.zgo.at/count.js';

export interface UsageCounter {
  /** Loads the counter script, which counts this visit. Safe to call twice. */
  start(): void;
  /** Counts an event. Dropped if the script has not loaded (or was blocked). */
  count(event: UsageEvent): void;
}

declare global {
  interface Window {
    /** Set by GoatCounter's count.js once it has loaded. */
    goatcounter?: { count?(vars: { path: string; event?: boolean }): void };
  }
}

/** The GoatCounter counter, or undefined anywhere but the published site. */
export function goatCounter(
  origin: string = location.origin,
  doc: Document = document,
): UsageCounter | undefined {
  if (origin !== SITE_ORIGIN) {
    return undefined;
  }

  return {
    start() {
      if (doc.querySelector(`script[src="${COUNTER_SCRIPT}"]`)) {
        return;
      }

      const script = doc.createElement('script');

      script.async = true;
      script.src = COUNTER_SCRIPT;
      script.dataset['goatcounter'] = COUNTER_ENDPOINT;
      doc.head.append(script);
    },
    count(event) {
      doc.defaultView?.goatcounter?.count?.({ path: event, event: true });
    },
  };
}

/** Whether the browser sends Global Privacy Control or Do Not Track. */
export function browserAsksNotToTrack(nav: Navigator = navigator): boolean {
  const signals = nav as Navigator & { globalPrivacyControl?: boolean };

  return signals.globalPrivacyControl === true || signals.doNotTrack === '1';
}
