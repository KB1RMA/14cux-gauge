// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { JSDOM, VirtualConsole } from 'jsdom';
import indexHtml from '../../index.html?raw';

const PAGE_URL = 'https://x.test/14cux-gauge/';
export const APP_SCRIPT = 'https://x.test/14cux-gauge/assets/index-abc.js';

/** Long enough for the page to decide the app did not start. */
export const WAIT = { timeout: 3000 };

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
export function load({ modules = true } = {}) {
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
export const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));
