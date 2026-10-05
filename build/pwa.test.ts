// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import type { BuildInfo } from '../src/buildInfo.ts';
import { pwa, writePwaFiles } from './pwa.ts';

const INFO: BuildInfo = {
  version: '1.2.3',
  commit: 'abc123',
  releaseTag: null,
};
const SCOPE = 'https://example.test/app/';

type Listener = (event: unknown) => void;

/** Runs the generated worker against a minimal fake of its global scope. */
function loadWorker(source: string, cacheNames: string[] = []) {
  const listeners = new Map<string, Listener>();
  const stored = new Map<string, Map<string, string>>(
    cacheNames.map((name) => [name, new Map()]),
  );
  const added: string[] = [];
  const self = {
    registration: { scope: SCOPE },
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, listener),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  };
  const caches = {
    open: (name: string) => {
      const cache = stored.get(name) ?? new Map<string, string>();

      stored.set(name, cache);

      return Promise.resolve({
        addAll: (requests: { url: string; cache: string }[]) => {
          for (const { url, cache: mode } of requests) {
            expect(mode).toBe('reload');
            added.push(url);
            cache.set(url, `body of ${url}`);
          }

          return Promise.resolve();
        },
      });
    },
    keys: () => Promise.resolve([...stored.keys()]),
    delete: (name: string) => Promise.resolve(stored.delete(name)),
    match: (url: string) => {
      for (const cache of stored.values()) {
        if (cache.has(url)) {
          return Promise.resolve(cache.get(url));
        }
      }

      return Promise.resolve(undefined);
    },
  };

  runInNewContext(source, {
    self,
    caches,
    URL,
    Request: class {
      constructor(
        public url: string,
        init: { cache: string },
      ) {
        this.cache = init.cache;
      }
      cache: string;
    },
    fetch: (request: { url: string }) =>
      Promise.resolve(`network ${request.url}`),
  });

  /** Fires an event and resolves with what the handler passed on. */
  async function dispatch(type: string, extra: object = {}): Promise<unknown> {
    let waited: Promise<unknown> | undefined;
    let responded: Promise<unknown> | undefined;

    listeners.get(type)?.({
      ...extra,
      waitUntil: (p: Promise<unknown>) => (waited = p),
      respondWith: (p: Promise<unknown>) => (responded = p),
    });

    return (await (waited ?? responded)) ?? 'ignored';
  }

  return { dispatch, stored, added, self };
}

describe('writePwaFiles', () => {
  let out: string;

  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'pwa-'));
    mkdirSync(join(out, 'assets'));
    writeFileSync(join(out, 'index.html'), '<html>');
    writeFileSync(join(out, 'assets', 'app-1.js'), 'js');
    writeFileSync(join(out, 'assets', 'app-1.js.map'), 'map');
  });

  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it('publishes the build info as version.json', () => {
    writePwaFiles(out, INFO);

    expect(JSON.parse(readFileSync(join(out, 'version.json'), 'utf8'))).toEqual(
      INFO,
    );
  });

  it('precaches the build, without source maps or its own files', async () => {
    writePwaFiles(out, INFO);

    const worker = loadWorker(readFileSync(join(out, 'sw.js'), 'utf8'));

    await worker.dispatch('install');

    expect(worker.added).toEqual([
      SCOPE,
      `${SCOPE}assets/app-1.js`,
      `${SCOPE}index.html`,
    ]);
  });

  it('names the cache after the content, so a changed file is a new cache', () => {
    const name = (): string => {
      writePwaFiles(out, INFO);

      return (
        /const CACHE = "([^"]+)"/.exec(
          readFileSync(join(out, 'sw.js'), 'utf8'),
        )?.[1] ?? ''
      );
    };

    const first = name();

    expect(name()).toBe(first);

    writeFileSync(join(out, 'assets', 'app-1.js'), 'changed');

    expect(name()).not.toBe(first);
    expect(first).toMatch(/^14cux-gauge-[0-9a-f]{16}$/);
  });

  describe('the worker', () => {
    async function installed() {
      writePwaFiles(out, INFO);

      const worker = loadWorker(readFileSync(join(out, 'sw.js'), 'utf8'), [
        '14cux-gauge-old',
        'something-else',
      ]);

      await worker.dispatch('install');

      return worker;
    }

    it('serves a page navigation from the cached index', async () => {
      const worker = await installed();

      expect(
        await worker.dispatch('fetch', {
          request: { method: 'GET', mode: 'navigate', url: `${SCOPE}?x=1` },
        }),
      ).toBe(`body of ${SCOPE}index.html`);
    });

    it('serves a cached asset, ignoring a query string', async () => {
      const worker = await installed();

      expect(
        await worker.dispatch('fetch', {
          request: {
            method: 'GET',
            mode: 'cors',
            url: `${SCOPE}assets/app-1.js?v=2`,
          },
        }),
      ).toBe(`body of ${SCOPE}assets/app-1.js`);
    });

    it.each([
      ['version.json', 'GET', `${SCOPE}version.json`],
      ['another origin', 'GET', 'https://other.test/app/assets/app-1.js'],
      ['a POST', 'POST', `${SCOPE}assets/app-1.js`],
    ])('leaves %s to the network', async (_name, method, url) => {
      const worker = await installed();

      expect(
        await worker.dispatch('fetch', {
          request: { method, mode: 'cors', url },
        }),
      ).toBe('ignored');
    });

    it('drops only older copies of itself when it takes over', async () => {
      const worker = await installed();

      await worker.dispatch('activate');

      expect([...worker.stored.keys()]).toEqual([
        'something-else',
        expect.stringMatching(/^14cux-gauge-[0-9a-f]{16}$/),
      ]);
      expect(worker.self.clients.claim).toHaveBeenCalled();
    });

    it('waits to be told to take over', async () => {
      const worker = await installed();

      await worker.dispatch('message', { data: { type: 'other' } });
      expect(worker.self.skipWaiting).not.toHaveBeenCalled();

      await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } });
      expect(worker.self.skipWaiting).toHaveBeenCalled();
    });
  });
});

describe('the Vite plugin', () => {
  it('writes the files into the resolved output directory after the bundle', () => {
    const out = mkdtempSync(join(tmpdir(), 'pwa-plugin-'));
    const plugin = pwa(INFO);
    const { closeBundle } = plugin as unknown as {
      closeBundle: { handler(this: void): void };
    };

    writeFileSync(join(out, 'index.html'), '<html>');
    (plugin.configResolved as (config: object) => void)({
      root: out,
      build: { outDir: '.' },
    });
    closeBundle.handler();

    expect(readFileSync(join(out, 'version.json'), 'utf8')).toContain('1.2.3');
    expect(readFileSync(join(out, 'sw.js'), 'utf8')).toContain('./index.html');
    rmSync(out, { recursive: true, force: true });
  });
});
