// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { vi, onTestFinished } from 'vitest';
import type { WakeLockHold, WakeLockPlatform } from '../platform/platform';
import { sessionOver } from '../test-support/ecuSession';
import { ScreenWake } from './screenWake';

/** A wake lock the test grants, refuses or takes back. */
function fakeWakeLock(available = true) {
  const holds: {
    released: boolean;
    end(): void;
  }[] = [];
  const visibleListeners = new Set<() => void>();
  let refuse = false;
  let pending: ((hold: WakeLockHold) => void) | undefined;
  let hold = false;
  let failingRelease = false;

  const platform: WakeLockPlatform = {
    available: () => available,
    request: () => {
      if (refuse) {
        return Promise.reject(new DOMException('Refused', 'NotAllowedError'));
      }

      const ended = new Set<() => void>();
      const record = {
        released: false,
        end: () => {
          record.released = true;

          for (const listener of ended) {
            listener();
          }
        },
      };
      const granted: WakeLockHold = {
        release: () => {
          record.released = true;

          return failingRelease
            ? Promise.reject(new Error('Already released'))
            : Promise.resolve();
        },
        onReleased: (listener) => {
          ended.add(listener);

          return () => {
            ended.delete(listener);
          };
        },
      };

      holds.push(record);

      if (hold) {
        return new Promise((resolve) => {
          pending = resolve;
        }).then(() => granted);
      }

      return Promise.resolve(granted);
    },
    onVisible: (listener) => {
      visibleListeners.add(listener);

      return () => {
        visibleListeners.delete(listener);
      };
    },
  };

  return {
    platform,
    holds,
    refuseNext: (value = true) => {
      refuse = value;
    },
    /** Makes requests wait until `grant`. */
    holdRequests: () => {
      hold = true;
    },
    grant: () => {
      pending?.({
        release: () => {
          holds.at(-1)?.end();

          return Promise.resolve();
        },
        onReleased: () => () => undefined,
      });
    },
    /** Makes the next lock fail when it is let go of. */
    failRelease: () => {
      failingRelease = true;
    },
    show: () => {
      for (const listener of visibleListeners) {
        listener();
      }
    },
  };
}

function setup(available = true) {
  const { session } = sessionOver([new SimulatedTransport()]);
  const wake = fakeWakeLock(available);
  const service = new ScreenWake(wake.platform, session);

  onTestFinished(() => {
    service.dispose();
  });

  return { session, wake, service };
}

const status = (service: ScreenWake) => service.getSnapshot().status;

describe('ScreenWake', () => {
  it('keeps the screen on only while connected, and lets go on disconnect', async () => {
    const { session, wake, service } = setup();

    service.setEnabled(true);
    expect(status(service)).toBe('inactive');
    expect(wake.holds).toHaveLength(0);

    await session.connect({ kind: 'demo' });
    await vi.waitFor(() => {
      expect(status(service)).toBe('on');
    });
    expect(wake.holds.map((hold) => hold.released)).toEqual([false]);

    await session.disconnect();

    expect(status(service)).toBe('inactive');
    expect(wake.holds.map((hold) => hold.released)).toEqual([true]);
  });

  it('lets go when the choice is turned off, and asks again when it is turned on', async () => {
    const { session, wake, service } = setup();

    service.setEnabled(true);
    await session.connect({ kind: 'demo' });
    await vi.waitFor(() => {
      expect(status(service)).toBe('on');
    });

    service.setEnabled(false);
    expect(status(service)).toBe('inactive');
    expect(wake.holds.map((hold) => hold.released)).toEqual([true]);

    service.setEnabled(true);
    await vi.waitFor(() => {
      expect(status(service)).toBe('on');
    });
    expect(wake.holds.map((hold) => hold.released)).toEqual([true, false]);
  });

  it('asks for nothing when the choice is off', async () => {
    const { session, wake, service } = setup();

    await session.connect({ kind: 'demo' });

    expect(status(service)).toBe('inactive');
    expect(wake.holds).toHaveLength(0);
  });

  it('says so when the browser cannot keep the screen on', async () => {
    const { session, wake, service } = setup(false);

    service.setEnabled(true);
    await session.connect({ kind: 'demo' });

    expect(status(service)).toBe('unsupported');
    expect(service.available()).toBe(false);
    expect(wake.holds).toHaveLength(0);
  });

  it('says so when the browser refuses', async () => {
    const { session, wake, service } = setup();

    wake.refuseNext();
    service.setEnabled(true);
    await session.connect({ kind: 'demo' });

    await vi.waitFor(() => {
      expect(status(service)).toBe('refused');
    });
  });

  it('says so when the browser ends the lock, and asks again once the page is shown', async () => {
    const { session, wake, service } = setup();

    service.setEnabled(true);
    await session.connect({ kind: 'demo' });
    await vi.waitFor(() => {
      expect(status(service)).toBe('on');
    });

    wake.holds[0]?.end();
    expect(status(service)).toBe('released');

    wake.show();

    await vi.waitFor(() => {
      expect(status(service)).toBe('on');
    });
    expect(wake.holds).toHaveLength(2);
  });

  it('releases a lock that was granted after the connection ended', async () => {
    const { session, wake, service } = setup();

    wake.holdRequests();
    service.setEnabled(true);
    await session.connect({ kind: 'demo' });
    expect(wake.holds).toHaveLength(1);

    await session.disconnect();
    wake.grant();

    await vi.waitFor(() => {
      expect(wake.holds.map((hold) => hold.released)).toEqual([true]);
    });
    expect(status(service)).toBe('inactive');
  });

  it('lets go of the lock when the app ends', async () => {
    const { session, wake, service } = setup();

    service.setEnabled(true);
    await session.connect({ kind: 'demo' });
    await vi.waitFor(() => {
      expect(status(service)).toBe('on');
    });

    service.dispose();

    expect(wake.holds.map((hold) => hold.released)).toEqual([true]);
  });

  it('lets go of a lock the browser cannot release, without failing', async () => {
    const { session, wake, service } = setup();

    wake.failRelease();
    service.setEnabled(true);
    await session.connect({ kind: 'demo' });
    await vi.waitFor(() => {
      expect(status(service)).toBe('on');
    });

    await session.disconnect();

    expect(status(service)).toBe('inactive');
    expect(wake.holds.map((hold) => hold.released)).toEqual([true]);
  });

  it('keeps the one lock while something else holds the ECU link', async () => {
    const { session, wake, service } = setup();

    service.setEnabled(true);
    await session.connect({ kind: 'demo' });
    await vi.waitFor(() => {
      expect(status(service)).toBe('on');
    });

    const lease = session.acquire({ kind: 'write', pausesPolling: false });

    lease?.release();

    expect(status(service)).toBe('on');
    expect(wake.holds).toHaveLength(1);
  });
});
