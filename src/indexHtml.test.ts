// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { JSDOM, VirtualConsole } from 'jsdom';
import indexHtml from '../index.html?raw';
import { expectNoAxeViolations } from './test-support/a11y';

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

const PAGE_URL = 'https://x.test/14cux-gauge/';
const APP_SCRIPT = 'https://x.test/14cux-gauge/assets/index-abc.js';

/** Long enough for the page to decide the app did not start. */
const WAIT = { timeout: 3000 };

interface Fakes {
  /** Cache names left after the page is done. */
  caches: string[];
  /** Scopes of the service workers left registered. */
  workers: string[];
  /** Requests the page made, with their cache mode. */
  fetches: [string, RequestCache | undefined][];
}

/**
 * Loads index.html in its own window and runs its inline script, as a
 * browser does before the app's code arrives. That code is never loaded
 * here: each test plays the part of the app, or of the browser failing it.
 */
function load({ modules = true } = {}) {
  const reloads: string[] = [];
  const virtualConsole = new VirtualConsole();

  // jsdom cannot navigate; it says so when the page reloads.
  virtualConsole.on('jsdomError', (error) => {
    reloads.push(error.message);
  });

  const fakes: Fakes = {
    caches: ['14cux-gauge-old', '14cux-gauge-new', 'another-app'],
    workers: [PAGE_URL, 'https://x.test/elsewhere/'],
    fetches: [],
  };
  const dom = new JSDOM(
    indexHtml.replace(/<script type="module"[^>]*><\/script>/, ''),
    {
      url: PAGE_URL,
      runScripts: 'dangerously',
      virtualConsole,
      beforeParse(window) {
        if (modules) {
          // jsdom does not run modules, and so has no `noModule`; browsers
          // that do have it.
          Object.defineProperty(
            window.HTMLScriptElement.prototype,
            'noModule',
            { value: false },
          );
        }

        Object.assign(window, {
          caches: {
            keys: () => Promise.resolve([...fakes.caches]),
            delete: (name: string) => {
              fakes.caches = fakes.caches.filter((cache) => cache !== name);

              return Promise.resolve(true);
            },
          },
          fetch: (url: string, init?: RequestInit) => {
            fakes.fetches.push([url, init?.cache]);

            return Promise.resolve();
          },
        });
        Object.defineProperty(window.navigator, 'serviceWorker', {
          value: {
            getRegistrations: () =>
              Promise.resolve(
                fakes.workers.map((scope) => ({
                  scope,
                  unregister: () => {
                    fakes.workers = fakes.workers.filter(
                      (worker) => worker !== scope,
                    );

                    return Promise.resolve(true);
                  },
                })),
              ),
          },
        });
      },
    },
  );
  const { window } = dom;
  const { document } = window;
  const root = document.getElementById('root') as HTMLElement;

  return {
    window,
    document,
    fakes,
    reloads,
    /** The app's first render. */
    render() {
      root.append(document.createElement('header'));
    },
    /** React emptying the page after an error no view caught. */
    unmount() {
      root.replaceChildren();
    },
    /** The browser failing to download one of the page's scripts. */
    failDownload(src: string) {
      const script = document.createElement('script');

      script.src = src;
      document.head.append(script);
      script.dispatchEvent(new window.Event('error'));
    },
    /** An error thrown by script at `filename`, or reported by React. */
    throwError(message: string, filename = APP_SCRIPT) {
      window.dispatchEvent(
        new window.ErrorEvent('error', {
          message,
          filename,
          error: new window.Error(message),
        }),
      );
    },
    heading() {
      return document.querySelector<HTMLElement>(
        'main:not([hidden]) h1:not([hidden])',
      );
    },
    text() {
      const main = document.getElementById('startup-error') as HTMLElement;

      if (main.hidden) {
        return '';
      }

      // What is shown: leave out what is hidden within it.
      const shown = main.cloneNode(true) as HTMLElement;

      for (const hidden of shown.querySelectorAll('[hidden]')) {
        hidden.remove();
      }

      return shown.textContent.replace(/\s+/g, ' ');
    },
    click(label: string) {
      const button = [...document.querySelectorAll('button')].find(
        (candidate) => candidate.textContent.trim() === label,
      );

      button?.click();
    },
    close() {
      window.close();
    },
  };
}

/** Lets the page's chance to show an error pass. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

describe('index.html when the app does not start', () => {
  let page: ReturnType<typeof load>;

  afterEach(() => {
    page.close();
  });

  it('says nothing while the app is loading', async () => {
    page = load();

    await settle();

    expect(page.text()).toBe('');
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

  it('leaves the app alone once it has rendered', async () => {
    page = load();
    page.render();

    page.throwError('a handled error');
    page.failDownload('https://x.test/14cux-gauge/assets/Dashboard-abc.js');
    await settle();

    expect(page.text()).toBe('');
  });

  it('leaves the app alone if it renders after an error', async () => {
    page = load();

    page.throwError('a passing error');
    page.render();
    await settle();

    expect(page.text()).toBe('');
  });

  it("ignores another site's script failing", async () => {
    page = load();

    page.failDownload('https://gc.zgo.at/count.js');
    page.throwError('Script error.', 'https://gc.zgo.at/count.js');
    await settle();

    expect(page.text()).toBe('');
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

  it('reloads', async () => {
    page = load();
    page.failDownload(APP_SCRIPT);
    await vi.waitFor(() => {
      expect(page.heading()).not.toBeNull();
    }, WAIT);

    page.click('Reload');

    expect(page.reloads).toEqual([
      expect.stringContaining('navigation') as string,
    ]);
    expect(page.fakes.caches).toHaveLength(3);
  });

  it("clears this app's offline copy, and nothing else, then reloads from the network", async () => {
    page = load();
    page.failDownload(APP_SCRIPT);
    await vi.waitFor(() => {
      expect(page.heading()).not.toBeNull();
    }, WAIT);

    page.click('Clear the offline copy and reload');

    await vi.waitFor(() => {
      expect(page.reloads).toHaveLength(1);
    });
    expect(page.fakes).toEqual({
      caches: ['another-app'],
      workers: ['https://x.test/elsewhere/'],
      fetches: [['https://x.test/14cux-gauge/', 'reload']],
    });
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
