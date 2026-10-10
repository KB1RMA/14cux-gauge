// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { broadcastChannels, browserPlatform } from './browser';

/** Captures what is handed to the browser to download, and what is released. */
function captureDownloads() {
  const blobs = new Map<string, Blob>();
  const revoked: string[] = [];

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:test/${String(blobs.size + 1)}`;

      blobs.set(url, blob);

      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => revoked.push(url),
  });

  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);

  return { blobs, revoked, click };
}

describe('browserPlatform', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serial');
  });

  it('saves text as a UTF-8 download through a temporary link, then releases it', async () => {
    vi.useFakeTimers();

    const { blobs, revoked, click } = captureDownloads();

    expect(
      await browserPlatform().files.save('log.txt', 'hello', 'text/plain'),
    ).toBe('saved');

    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.contexts[0]).toMatchObject({
      href: 'blob:test/1',
      download: 'log.txt',
    });

    const saved = blobs.get('blob:test/1');

    expect(await saved?.text()).toBe('hello');
    expect(saved?.type).toBe('text/plain;charset=utf-8');
    expect(revoked).toEqual([]);

    vi.advanceTimersByTime(1_000);

    expect(revoked).toEqual(['blob:test/1']);
  });

  it('saves bytes as they are, unaffected by later changes to the array', async () => {
    const { blobs, click } = captureDownloads();
    const bytes = Uint8Array.of(0x00, 0x7f, 0xff);

    await browserPlatform().files.save(
      'image.bin',
      bytes,
      'application/octet-stream',
    );
    bytes[0] = 0x55;

    expect(click.mock.contexts[0]).toMatchObject({ download: 'image.bin' });

    const saved = blobs.get('blob:test/1');

    expect(saved?.type).toBe('application/octet-stream');
    expect(new Uint8Array((await saved?.arrayBuffer()) ?? [])).toEqual(
      Uint8Array.of(0x00, 0x7f, 0xff),
    );
  });

  it('offers serial ports only where the browser has Web Serial', () => {
    const { serial } = browserPlatform();

    expect(serial.available()).toBe(false);

    Object.defineProperty(navigator, 'serial', {
      value: {},
      configurable: true,
    });

    expect(serial.available()).toBe(true);
  });

  it('describes the chosen port by its USB IDs', async () => {
    const port = Object.assign(new EventTarget(), {
      getInfo: () => ({ usbVendorId: 0x403, usbProductId: 0x6001 }),
    });

    Object.defineProperty(navigator, 'serial', {
      value: { requestPort: () => Promise.resolve(port) },
      configurable: true,
    });

    const chosen = await browserPlatform().serial.requestPort();

    expect(chosen.description).toBe('USB vendor 0x0403, product 0x6001');
  });

  it('describes a port without USB IDs as unknown', async () => {
    Object.defineProperty(navigator, 'serial', {
      value: { requestPort: () => Promise.resolve(new EventTarget()) },
      configurable: true,
    });

    const chosen = await browserPlatform().serial.requestPort();

    expect(chosen.description).toBe('USB vendor unknown, product unknown');
  });

  it('passes on a dismissed port picker as it was reported', async () => {
    const dismissed = new DOMException('No port selected', 'NotFoundError');

    Object.defineProperty(navigator, 'serial', {
      value: { requestPort: () => Promise.reject(dismissed) },
      configurable: true,
    });

    await expect(browserPlatform().serial.requestPort()).rejects.toBe(
      dismissed,
    );
  });

  it('reports a chosen port being unplugged until told to stop', async () => {
    const port = new EventTarget();

    Object.defineProperty(navigator, 'serial', {
      value: { requestPort: () => Promise.resolve(port) },
      configurable: true,
    });

    const { serial } = browserPlatform();
    const link = serial.open(await serial.requestPort(), { baudRate: 7812 });
    const lost = vi.fn();
    const stop = link.onLost(lost);

    port.dispatchEvent(new Event('disconnect'));
    expect(lost).toHaveBeenCalledOnce();

    stop();
    port.dispatchEvent(new Event('disconnect'));
    expect(lost).toHaveBeenCalledOnce();
  });

  it('refuses to open a port another platform gave out', () => {
    expect(() =>
      browserPlatform().serial.open(
        { description: 'USB vendor 0x0403, product 0x6001' },
        { baudRate: 7812 },
      ),
    ).toThrow('That port did not come from Web Serial.');
  });

  it('tells a setting that another window changed it, and only that setting', () => {
    const { settings } = browserPlatform();
    const changed = vi.fn();
    const stop = settings.watch('graphs', changed);

    const fire = (key: string | null) => {
      window.dispatchEvent(
        new StorageEvent('storage', { key, storageArea: localStorage }),
      );
    };

    fire('cuxGauge.readings');
    expect(changed).not.toHaveBeenCalled();

    fire('cuxGauge.graphs');
    fire(null);
    expect(changed).toHaveBeenCalledTimes(2);

    stop();
    fire('cuxGauge.graphs');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('swaps in the parts it is given', () => {
    const storage = { open: vi.fn() };
    const platform = browserPlatform({ storage });

    expect(platform.storage).toBe(storage);
    expect(platform.settings).toBe(browserPlatform().settings);
  });
});

describe('broadcastChannels', () => {
  it('tells other channels of the same name, but not the one that posted', async () => {
    const first = broadcastChannels('cuxGauge:test');
    const second = broadcastChannels('cuxGauge:test');
    const other = broadcastChannels('cuxGauge:other');
    const heardFirst = vi.fn();
    const heardSecond = vi.fn();
    const heardOther = vi.fn();

    first.listen(heardFirst);
    second.listen(heardSecond);
    other.listen(heardOther);
    onTestFinished(() => {
      first.close();
      second.close();
      other.close();
    });

    first.post();
    await vi.waitFor(() => {
      expect(heardSecond).toHaveBeenCalledTimes(1);
    });
    expect(heardFirst).not.toHaveBeenCalled();
    expect(heardOther).not.toHaveBeenCalled();
  });

  it('does nothing, and does not throw, without BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });

    const channel = broadcastChannels('cuxGauge:test');

    expect(() => {
      channel.listen(() => undefined);
      channel.post();
      channel.close();
    }).not.toThrow();
  });
});

describe('browserPlatform app', () => {
  it('restarts by reloading the page', () => {
    const reload = vi.fn();

    vi.stubGlobal('location', { reload });
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    browserPlatform().app.reload();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('browserPlatform storage', () => {
  it('uses memory when the browser has no IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });

    const storage = await browserPlatform().storage.open();

    expect(storage.persistent).toBe(false);
    storage.close();
  });
});
