// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { BuildInfo } from '../buildInfo';
import { AppStatusStore } from './appStatusStore';

const RUNNING: BuildInfo = {
  version: '1.0.0',
  commit: 'aaa',
  releaseTag: null,
};
const NEWER: BuildInfo = {
  version: '1.1.0',
  commit: 'bbb',
  releaseTag: 'v1.1.0',
};

class FakeWorker extends EventTarget {
  state = 'installing';
  postMessage = vi.fn();

  install(): void {
    this.state = 'installed';
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(() => Promise.resolve());

  foundWorker(): FakeWorker {
    this.installing = new FakeWorker();
    this.dispatchEvent(new Event('updatefound'));

    return this.installing;
  }
}

class FakeContainer extends EventTarget {
  controller: object | null = {};
  registration = new FakeRegistration();
  register = vi.fn(() => Promise.resolve(this.registration));
}

function setOnline(online: boolean): void {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

function setup(published: unknown = RUNNING) {
  const container = new FakeContainer();
  const reload = vi.fn();
  const fetchJson = vi.fn(() => Promise.resolve(published));
  const store = new AppStatusStore({
    build: RUNNING,
    versionUrl: 'https://x.test/version.json',
    serviceWorker: container as unknown as ServiceWorkerContainer,
    serviceWorkerUrl: 'https://x.test/sw.js',
    fetchJson,
    reload,
  });
  const stop = store.start();

  return { store, container, reload, fetchJson, stop };
}

/** Lets the store's pending promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AppStatusStore', () => {
  beforeEach(() => {
    setOnline(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts online and up to date when the published build is this one', async () => {
    const { store, container, fetchJson, stop } = setup();

    await settle();

    expect(store.getSnapshot()).toEqual({
      running: RUNNING,
      online: true,
      latest: RUNNING,
      update: 'none',
    });
    expect(fetchJson).toHaveBeenCalledWith('https://x.test/version.json');
    expect(container.register).toHaveBeenCalledWith('https://x.test/sw.js');
    expect(container.registration.update).not.toHaveBeenCalled();
    stop();
  });

  it('follows the network going away and coming back, checking on return', async () => {
    const { store, fetchJson, stop } = setup();

    await settle();
    setOnline(false);
    window.dispatchEvent(new Event('offline'));

    expect(store.getSnapshot().online).toBe(false);

    setOnline(true);
    window.dispatchEvent(new Event('online'));

    expect(store.getSnapshot().online).toBe(true);
    await vi.waitFor(() => {
      expect(fetchJson).toHaveBeenCalledTimes(2);
    });
    stop();
  });

  it('does not ask the network while offline', async () => {
    setOnline(false);

    const { store, fetchJson, stop } = setup();

    await settle();

    expect(fetchJson).not.toHaveBeenCalled();
    expect(store.getSnapshot().online).toBe(false);
    stop();
  });

  it('checks again when the page becomes visible', async () => {
    const { fetchJson, stop } = setup();

    await settle();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => {
      expect(fetchJson).toHaveBeenCalledTimes(2);
    });
    stop();
  });

  it('stops listening when stopped', async () => {
    const { store, stop } = setup();

    await settle();
    stop();
    setOnline(false);
    window.dispatchEvent(new Event('offline'));

    expect(store.getSnapshot().online).toBe(true);
  });

  it('reports a download while the new worker installs, then ready', async () => {
    const { store, container, stop } = setup(NEWER);

    await settle();

    expect(store.getSnapshot()).toMatchObject({
      latest: NEWER,
      update: 'downloading',
    });
    expect(container.registration.update).toHaveBeenCalled();

    const worker = container.registration.foundWorker();

    worker.install();

    expect(store.getSnapshot().update).toBe('ready');
    stop();
  });

  it('is ready at once if a new worker was already waiting', async () => {
    const container = new FakeContainer();

    container.registration.waiting = new FakeWorker();

    const store = new AppStatusStore({
      build: RUNNING,
      versionUrl: 'v',
      serviceWorker: container as unknown as ServiceWorkerContainer,
      serviceWorkerUrl: 's',
      fetchJson: () => Promise.reject(new Error('offline')),
    });
    const stop = store.start();

    await settle();

    expect(store.getSnapshot()).toMatchObject({
      latest: undefined,
      update: 'ready',
    });
    stop();
  });

  it('does not call the first install an update', async () => {
    const { store, container, stop } = setup();

    container.controller = null;
    await settle();
    container.registration.foundWorker().install();

    expect(store.getSnapshot().update).toBe('none');
    stop();
  });

  it('is ready to reload when there is no service worker', async () => {
    const store = new AppStatusStore({
      build: RUNNING,
      versionUrl: 'v',
      fetchJson: () => Promise.resolve(NEWER),
    });
    const stop = store.start();

    await settle();

    expect(store.getSnapshot().update).toBe('ready');
    stop();
  });

  it('survives a failed registration and an unreadable version.json', async () => {
    const container = new FakeContainer();

    container.register.mockRejectedValue(new Error('blocked'));

    const store = new AppStatusStore({
      build: RUNNING,
      versionUrl: 'v',
      serviceWorker: container as unknown as ServiceWorkerContainer,
      serviceWorkerUrl: 's',
      fetchJson: () => Promise.resolve('<!doctype html>'),
    });
    const stop = store.start();

    await settle();

    expect(store.getSnapshot()).toEqual({
      running: RUNNING,
      online: true,
      latest: undefined,
      update: 'none',
    });
    stop();
  });

  it('notifies subscribers of changes, and only changes', async () => {
    const { store, stop } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    await settle();
    listener.mockClear();
    await store.check();

    expect(listener).not.toHaveBeenCalled();

    setOnline(false);
    window.dispatchEvent(new Event('offline'));

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    stop();
  });

  describe('applyUpdate', () => {
    it('hands over to the waiting worker, then reloads', async () => {
      const { store, container, reload, stop } = setup(NEWER);

      await settle();

      const worker = container.registration.foundWorker();

      worker.install();
      container.registration.waiting = worker;
      store.applyUpdate();

      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(reload).not.toHaveBeenCalled();

      container.dispatchEvent(new Event('controllerchange'));

      expect(reload).toHaveBeenCalledTimes(1);
      stop();
    });

    it('just reloads when no worker is waiting', async () => {
      const { store, reload, stop } = setup(NEWER);

      await settle();
      store.applyUpdate();

      expect(reload).toHaveBeenCalledTimes(1);
      stop();
    });
  });
});
