// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { BuildInfo } from '../buildInfo';
import { parseBuildInfo, sameBuild } from './build';

/**
 * - `none`: this is the latest build, or it is not known to be otherwise.
 * - `downloading`: a newer build is published and is being fetched for
 *   offline use. Reloading now would only bring back the old copy.
 * - `ready`: a newer build can be started by reloading.
 */
export type UpdateState = 'none' | 'downloading' | 'ready';

export interface AppStatus {
  /** The build this page is running. */
  running: BuildInfo;
  /** The browser's view of the network; false means the app is offline. */
  online: boolean;
  /** The build that is published, once it has been fetched. */
  latest: BuildInfo | undefined;
  update: UpdateState;
}

export interface AppStatusStoreOptions {
  /** The build this page is running. */
  build: BuildInfo;
  /** Where the published build is described; `version.json` beside the page. */
  versionUrl: string;
  /** Where the service worker is; leave out to run without one. */
  serviceWorkerUrl?: string;
  /** Leave out outside a secure context or without service worker support. */
  serviceWorker?: ServiceWorkerContainer;
  /** Defaults to `fetch`. */
  fetchJson?: (url: string) => Promise<unknown>;
  /** Defaults to `location.reload`. */
  reload?: () => void;
}

const DEFAULT_FETCH = async (url: string): Promise<unknown> => {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`${url}: ${String(response.status)}`);
  }

  return response.json();
};

/**
 * Tracks whether the app is offline and whether a newer build has been
 * published, by comparing the running build with `version.json`, which the
 * service worker never caches. Plain TypeScript so a React component can read
 * it through `useSyncExternalStore`.
 *
 * An update is only offered as `ready` once the new service worker has
 * downloaded the whole build and is waiting; with no service worker a reload
 * is enough. Nothing reloads the page by itself: it may be connected to an
 * ECU.
 */
export class AppStatusStore {
  private status: AppStatus;
  private readonly listeners = new Set<() => void>();
  private registration: ServiceWorkerRegistration | undefined;
  private waiting = false;
  private differs = false;
  private checking = false;
  private registered: Promise<void> = Promise.resolve();

  constructor(private readonly options: AppStatusStoreOptions) {
    // Online until `start` reads the network: a store that is never started
    // (checks switched off) must not report the app as offline for good.
    this.status = {
      running: options.build,
      online: true,
      latest: undefined,
      update: 'none',
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): AppStatus => this.status;

  /** Registers the service worker and starts watching; returns the stop function. */
  start(): () => void {
    const onOnline = () => {
      this.setOnline(true);
      void this.check();
    };

    const onOffline = () => {
      this.setOnline(false);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void this.check();
      }
    };

    this.setOnline(navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    this.registered = this.register();
    void this.check();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }

  /** Fetches the published build and compares it with this one. */
  async check(): Promise<void> {
    // Offline there is nothing to fetch, and a failed request is logged by
    // the browser as an error.
    if (!navigator.onLine || this.checking) {
      return;
    }

    this.checking = true;

    try {
      const latest = parseBuildInfo(
        await (this.options.fetchJson ?? DEFAULT_FETCH)(
          this.options.versionUrl,
        ),
      );

      await this.registered;

      if (latest) {
        this.differs = !sameBuild(latest, this.options.build);
        this.publish({ latest });

        // Fetch the new build now, while there is a network. Also when a
        // worker is already waiting: it may be an older build than this one.
        if (this.differs) {
          void this.registration?.update().catch(() => undefined);
        }
      }
    } catch {
      // Unreachable or unreadable: keep what is known; the next trigger retries.
    } finally {
      this.checking = false;
    }
  }

  /** Starts the newer build, which reloads the page. */
  applyUpdate(): void {
    const reload =
      this.options.reload ??
      (() => {
        location.reload();
      });
    const worker = this.registration?.waiting;

    if (worker && this.options.serviceWorker) {
      // The new worker takes over, then the page restarts under it.
      this.options.serviceWorker.addEventListener('controllerchange', reload, {
        once: true,
      });
      worker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      reload();
    }
  }

  private async register(): Promise<void> {
    const { serviceWorker, serviceWorkerUrl } = this.options;

    if (!serviceWorker || !serviceWorkerUrl) {
      return;
    }

    try {
      const registration = await serviceWorker.register(serviceWorkerUrl);

      this.registration = registration;

      // An update is only an update if a worker already controls the page;
      // the first install is just the offline copy being made.
      if (registration.waiting && serviceWorker.controller) {
        this.waiting = true;
      }

      registration.addEventListener('updatefound', () => {
        this.watch(registration.installing);
      });
      this.watch(registration.installing);
      this.publish({});
    } catch {
      // No service worker (private window, blocked): the app still works online.
    }
  }

  private watch(worker: ServiceWorker | null): void {
    const { serviceWorker } = this.options;

    if (!worker || !serviceWorker?.controller) {
      // Nothing installing, or the first install: just the offline copy.
      return;
    }

    // A newer build is installing and will replace any worker that is
    // waiting, so reloading now would start the older one.
    this.waiting = false;
    this.publish({});

    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'redundant') {
        // Installed, it is the waiting worker; if it failed, the one that was
        // waiting before (if any) still is.
        this.waiting = Boolean(this.registration?.waiting);
        this.publish({});
      }
    });
  }

  private setOnline(online: boolean): void {
    this.publish({ online });
  }

  private publish(change: Partial<AppStatus>): void {
    let update: UpdateState = 'none';

    if (this.waiting) {
      update = 'ready';
    } else if (this.differs) {
      // With no worker to wait for, a reload fetches the new build.
      update = this.registration ? 'downloading' : 'ready';
    }

    const next = { ...this.status, ...change, update };

    if (
      next.online === this.status.online &&
      (next.latest === this.status.latest ||
        (next.latest !== undefined &&
          this.status.latest !== undefined &&
          sameBuild(next.latest, this.status.latest))) &&
      next.update === this.status.update
    ) {
      return;
    }

    this.status = next;

    for (const listener of this.listeners) {
      listener();
    }
  }
}
