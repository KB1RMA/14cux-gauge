// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { SerialPortHandle } from './platform';
import { blockStorage } from '../test-support/storage';
import {
  affectsSetting,
  broadcastChannels,
  browserAsksNotToTrack,
  browserPlatform,
  readRawSetting,
  writeSetting,
} from './browser';

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

  it('lists the ports the user has already allowed, described by their USB IDs', async () => {
    const granted = Object.assign(new EventTarget(), {
      getInfo: () => ({ usbVendorId: 0x403, usbProductId: 0x6001 }),
    });

    Object.defineProperty(navigator, 'serial', {
      value: { getPorts: () => Promise.resolve([granted, new EventTarget()]) },
      configurable: true,
    });

    const ports = await browserPlatform().serial.grantedPorts();

    expect(ports.map((port) => port.description)).toEqual([
      'USB vendor 0x0403, product 0x6001',
      'USB vendor unknown, product unknown',
    ]);
  });

  it('opens a port it listed without asking the user', async () => {
    const port = new EventTarget();

    Object.defineProperty(navigator, 'serial', {
      value: { getPorts: () => Promise.resolve([port]) },
      configurable: true,
    });

    const { serial } = browserPlatform();
    const [granted] = await serial.grantedPorts();

    expect(granted).toBeDefined();
    expect(() =>
      serial.open(granted as SerialPortHandle, { baudRate: 7812 }),
    ).not.toThrow();
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

describe('browser screen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'wakeLock');
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    Reflect.deleteProperty(document, 'fullscreenElement');
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  });

  /** A stand-in for the browser's lock, which ends on `release` events. */
  function sentinel() {
    const lock = Object.assign(new EventTarget(), {
      release: vi.fn(() => Promise.resolve()),
    });

    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn(() => Promise.resolve(lock)) },
      configurable: true,
    });

    return lock;
  }

  it('can keep the screen on only where the browser has a wake lock', () => {
    const { wakeLock } = browserPlatform().screen;

    expect(wakeLock.available()).toBe(false);

    sentinel();

    expect(wakeLock.available()).toBe(true);
  });

  it('asks for a screen lock, and releases it when told to', async () => {
    const lock = sentinel();
    const hold = await browserPlatform().screen.wakeLock.request();

    expect(
      (navigator.wakeLock.request as ReturnType<typeof vi.fn>).mock.calls,
    ).toEqual([['screen']]);

    await hold.release();

    expect(lock.release).toHaveBeenCalledOnce();
  });

  it('reports a lock the browser ended, until told to stop', async () => {
    const lock = sentinel();
    const hold = await browserPlatform().screen.wakeLock.request();
    const ended = vi.fn();
    const stop = hold.onReleased(ended);

    lock.dispatchEvent(new Event('release'));
    expect(ended).toHaveBeenCalledOnce();

    stop();
    lock.dispatchEvent(new Event('release'));
    expect(ended).toHaveBeenCalledOnce();
  });

  it('passes on a refused lock as it was reported', async () => {
    const refused = new DOMException('Low battery', 'NotAllowedError');

    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: () => Promise.reject(refused) },
      configurable: true,
    });

    await expect(browserPlatform().screen.wakeLock.request()).rejects.toBe(
      refused,
    );
  });

  it('tells when the page is shown again, not when it is hidden', () => {
    const visible = vi.fn();
    const stop = browserPlatform().screen.wakeLock.onVisible(visible);
    let state: DocumentVisibilityState = 'hidden';

    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => state,
    );

    document.dispatchEvent(new Event('visibilitychange'));
    expect(visible).not.toHaveBeenCalled();

    state = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(visible).toHaveBeenCalledOnce();

    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(visible).toHaveBeenCalledOnce();
  });

  it('offers full screen only where the browser allows it', () => {
    const { fullscreen } = browserPlatform().screen;

    expect(fullscreen.available()).toBe(false);

    Object.defineProperty(document, 'fullscreenEnabled', {
      value: true,
      configurable: true,
    });

    // Enabled, but nothing to request it with.
    expect(fullscreen.available()).toBe(false);

    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: () => Promise.resolve(),
      configurable: true,
    });

    expect(fullscreen.available()).toBe(true);
  });

  it('shows the whole page full screen, and tells when that changes', async () => {
    const request = vi.fn(() => Promise.resolve());
    const leave = vi.fn(() => Promise.resolve());
    const { fullscreen } = browserPlatform().screen;
    const changed = vi.fn();
    const stop = fullscreen.watch(changed);

    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: request,
      configurable: true,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      value: leave,
      configurable: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    });

    expect(fullscreen.active()).toBe(false);

    await fullscreen.enter();
    expect(request).toHaveBeenCalledOnce();

    Object.defineProperty(document, 'fullscreenElement', {
      value: document.documentElement,
      configurable: true,
    });
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(changed).toHaveBeenCalledOnce();
    expect(fullscreen.active()).toBe(true);

    await fullscreen.exit();
    expect(leave).toHaveBeenCalledOnce();

    stop();
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(changed).toHaveBeenCalledOnce();
  });

  it('has nothing to leave when it is not full screen', async () => {
    const leave = vi.fn(() => Promise.resolve());

    Object.defineProperty(document, 'exitFullscreen', {
      value: leave,
      configurable: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    });

    await browserPlatform().screen.fullscreen.exit();

    expect(leave).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, 'exitFullscreen');
  });
});

describe('browser settings', () => {
  // The `cuxGauge.` key prefix is what this backend specifies, so it is
  // asserted here and nowhere in the views' tests.
  it('stores JSON under the cuxGauge prefix and reads it back', () => {
    expect(writeSetting('graphs', { window: 300 })).toBe('{"window":300}');
    expect(localStorage.getItem('cuxGauge.graphs')).toBe('{"window":300}');
    expect(readRawSetting('graphs')).toBe('{"window":300}');
    expect(readRawSetting('readings')).toBeNull();
  });

  it('works without storage', () => {
    blockStorage();

    expect(readRawSetting('window')).toBeUndefined();
    expect(writeSetting('window', 30)).toBeUndefined();
  });

  it('tells which changes in another window affect a setting', () => {
    const event = (key: string | null, storageArea: Storage = localStorage) =>
      new StorageEvent('storage', { key, storageArea });

    expect(affectsSetting(event('cuxGauge.graphs'), 'graphs')).toBe(true);
    // Cleared.
    expect(affectsSetting(event(null), 'graphs')).toBe(true);
    expect(affectsSetting(event('cuxGauge.readings'), 'graphs')).toBe(false);
    expect(affectsSetting(event('graphs'), 'graphs')).toBe(false);
    expect(
      affectsSetting(event('cuxGauge.graphs', sessionStorage), 'graphs'),
    ).toBe(false);
  });

  it('counts usage by default', () => {
    expect(browserPlatform().settings.defaults()).toEqual({
      usageCounts: 'on',
    });
  });

  it('does not count usage by default when the browser asks not to be tracked', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      value: true,
      configurable: true,
    });

    try {
      expect(browserPlatform().settings.defaults()).toEqual({
        usageCounts: 'off',
      });
    } finally {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        value: undefined,
        configurable: true,
      });
    }
  });
});

describe('browserAsksNotToTrack', () => {
  const nav = (signals: object) => signals as Navigator;

  it('honours Global Privacy Control and Do Not Track', () => {
    expect(browserAsksNotToTrack(nav({ globalPrivacyControl: true }))).toBe(
      true,
    );
    expect(browserAsksNotToTrack(nav({ doNotTrack: '1' }))).toBe(true);
  });

  it('is false without either signal', () => {
    expect(browserAsksNotToTrack(nav({}))).toBe(false);
    expect(
      browserAsksNotToTrack(
        nav({ globalPrivacyControl: false, doNotTrack: '0' }),
      ),
    ).toBe(false);
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

describe('browserPlatform opening files', () => {
  /** Answers the file picker the next time a page opens it. */
  function answerPicker(answer: (input: HTMLInputElement) => void) {
    const pickers: HTMLInputElement[] = [];
    const spy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(function (this: HTMLInputElement) {
        pickers.push(this);
        answer(this);
      });

    onTestFinished(() => {
      spy.mockRestore();
    });

    return pickers;
  }

  it('reads the file the user chose as text, offering only the given kinds', async () => {
    const pickers = answerPicker((input) => {
      Object.defineProperty(input, 'files', {
        value: [new File(['{"kind":"x"}\n'], 'idle.json')],
      });
      input.dispatchEvent(new Event('change'));
    });

    expect(await browserPlatform().files.open(['.json', '.txt'])).toEqual({
      name: 'idle.json',
      text: '{"kind":"x"}\n',
    });
    expect(pickers[0]?.accept).toBe('.json,.txt');
    expect(pickers[0]?.type).toBe('file');
    // Gone from the page once it has answered.
    expect(pickers[0]?.isConnected).toBe(false);
  });

  it('says so when the user dismisses the picker', async () => {
    const pickers = answerPicker((input) => {
      input.dispatchEvent(new Event('cancel'));
    });

    expect(await browserPlatform().files.open(['.json'])).toBe('cancelled');
    expect(pickers[0]?.isConnected).toBe(false);
  });
});
