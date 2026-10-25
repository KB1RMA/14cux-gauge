// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { APP_SCRIPT, WAIT, load, settle } from './test-support/startupPage';

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
});
