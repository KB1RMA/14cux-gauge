// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import indexHtml from '../index.html?raw';
import { expectNoAxeViolations } from './test-support/a11y';
import { APP_SCRIPT, WAIT, load } from './test-support/startupPage';

// Page-level accessibility requirements that live in index.html rather than
// in rendered components.
describe('index.html', () => {
  const page = new DOMParser().parseFromString(indexHtml, 'text/html');

  it('declares the page language', () => {
    expect(page.documentElement.lang).toBe('en');
  });

  it('has a descriptive title', () => {
    expect(page.title).toBe(
      '14CUX Gauge: 14CUX ECU diagnostics in the browser',
    );
  });

  it('names the published address for search engines', () => {
    expect(
      page.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe('https://kb1rma.github.io/14cux-gauge/');
  });

  it('lets the page zoom', () => {
    const viewport = page
      .querySelector('meta[name="viewport"]')
      ?.getAttribute('content');

    expect(viewport).toBe('width=device-width, initial-scale=1.0');
  });

  it('links the web app manifest', () => {
    expect(
      page.querySelector('link[rel="manifest"]')?.getAttribute('href'),
    ).toBe('./manifest.webmanifest');
  });
});

describe('index.html when the app does not start', () => {
  let page: ReturnType<typeof load>;

  afterEach(() => {
    page.close();
  });

  it('says so when a script of the app could not be downloaded', async () => {
    page = load();

    page.failDownload(APP_SCRIPT);

    await vi.waitFor(() => {
      expect(page.heading()?.textContent.trim()).toBe(
        '14CUX Gauge could not start',
      );
    }, WAIT);
    expect(page.text()).toContain(
      'Part of the app could not be downloaded. ' +
        'Reload to try again. If it keeps happening, this device may be ' +
        'holding an old or incomplete offline copy of the app: clear it to ' +
        'load the latest version. That needs an internet connection. Your ' +
        'recorded sessions, ROM images and settings are kept. ' +
        'Error: Could not load https://x.test/14cux-gauge/assets/index-abc.js',
    );
    expect(page.document.activeElement).toBe(page.heading());
  });

  it('shows the error the app stopped with before it rendered', async () => {
    page = load();

    page.throwError('indexedDB is not defined');

    await vi.waitFor(() => {
      expect(page.text()).toContain(
        'The app stopped with an error while starting.',
      );
    }, WAIT);
    expect(page.text()).toContain('Error: indexedDB is not defined');
  });

  it('shows an error React reports after emptying the page', async () => {
    page = load();
    page.render();
    page.unmount();

    page.throwError('Cannot read properties of undefined');

    await vi.waitFor(() => {
      expect(page.text()).toContain(
        'Error: Cannot read properties of undefined',
      );
    }, WAIT);
  });

  it('shows a promise that failed before the app rendered', async () => {
    page = load();

    const reason = new page.window.Error('storage is unavailable');
    const rejected = page.window.Promise.reject(reason);

    rejected.catch(() => undefined);
    const { PromiseRejectionEvent } = page.window as unknown as typeof window;

    page.window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: rejected,
        reason,
      }),
    );

    await vi.waitFor(() => {
      expect(page.text()).toContain('Error: storage is unavailable');
    }, WAIT);
  });

  it('keeps the first error, which is usually the cause', async () => {
    page = load();

    page.failDownload(APP_SCRIPT);
    page.throwError('a later error');

    await vi.waitFor(() => {
      expect(page.text()).toContain('Error: Could not load');
    }, WAIT);
    expect(page.text()).not.toContain('a later error');
  });

  it('says when the browser is too old to run the app', async () => {
    page = load({ modules: false });

    await vi.waitFor(() => {
      expect(page.text()).toContain(
        'This browser is too old to run 14CUX Gauge. Update it, or try a ' +
          'recent Chrome, Edge, Firefox or Safari.',
      );
    }, WAIT);
    expect(page.text()).not.toContain('Error:');
  });

  it('has no accessibility violations', async () => {
    page = load();
    page.failDownload(APP_SCRIPT);
    await vi.waitFor(() => {
      expect(page.heading()).not.toBeNull();
    }, WAIT);

    // axe runs in this test's document, so check a copy of the page there.
    document.body.innerHTML = page.document.body.innerHTML;

    try {
      await expectNoAxeViolations(document.body);
    } finally {
      document.body.replaceChildren();
    }
  });
});
