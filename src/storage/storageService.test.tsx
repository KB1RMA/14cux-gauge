// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { renderHook } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { sessionOver } from '../test-support/ecuSession';
import { testPlatform } from '../test-support/platform';
import { TestSessionServices } from '../test-support/TestApp';
import { SessionsProvider } from '../sessions/SessionsProvider';
import { useSessions } from '../sessions/useSessions';
import { memoryStorage, openStorage, type AppStorage } from './openStorage';
import { StorageService } from './storageService';

/** Storage that opens only when `finish` is called. */
function slowStorage() {
  const storage = memoryStorage();
  const close = vi.spyOn(storage, 'close');

  let finish = () => {};

  const open = () =>
    new Promise<AppStorage>((resolve) => {
      finish = () => {
        resolve(storage);
      };
    });

  return { open, close, finish: () => finish() };
}

describe('StorageService', () => {
  it('is not open until storage has opened, and tells listeners when it is', async () => {
    const { open, finish } = slowStorage();
    const service = new StorageService(open);
    const listener = vi.fn();

    service.subscribe(listener);

    expect(service.getSnapshot()).toBeUndefined();

    finish();
    await vi.waitFor(() => {
      expect(service.getSnapshot()).toBeDefined();
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('closes storage that finishes opening after the app has gone', async () => {
    const { open, close, finish } = slowStorage();
    const service = new StorageService(open);

    service.dispose();
    finish();
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
    expect(service.getSnapshot()).toBeUndefined();
  });

  it('closes storage when the app goes', async () => {
    const storage = memoryStorage();
    const close = vi.spyOn(storage, 'close');
    const service = new StorageService(() => Promise.resolve(storage));

    await vi.waitFor(() => {
      expect(service.getSnapshot()).toBeDefined();
    });
    service.dispose();

    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('StorageService status', () => {
  it('is opening, then open', async () => {
    const { open, finish } = slowStorage();
    const service = new StorageService(open);

    expect(service.getStatus()).toEqual({ status: 'opening' });
    finish();
    await vi.waitFor(() => {
      expect(service.getStatus().status).toBe('open');
    });
  });

  it('is failed when the platform cannot open storage', async () => {
    const service = new StorageService(() =>
      Promise.reject(new Error('no disk')),
    );

    await vi.waitFor(() => {
      expect(service.getStatus()).toEqual({ status: 'failed' });
    });
    expect(service.getSnapshot()).toBeUndefined();
  });

  it('is closed when another window upgrades the database', async () => {
    const factory = new IDBFactory();
    const service = new StorageService(() => openStorage(factory));

    await vi.waitFor(() => {
      expect(service.getStatus().status).toBe('open');
    });
    await new Promise<void>((resolve, reject) => {
      const req = factory.open('cuxGauge', 99);

      req.onsuccess = () => {
        req.result.close();
        resolve();
      };

      req.onerror = () => {
        reject(req.error ?? new Error('upgrade failed'));
      };
    });

    expect(service.getStatus()).toEqual({ status: 'closed' });
    expect(service.getSnapshot()).toBeUndefined();
    service.dispose();
  });
});

describe('sessions before storage is open', () => {
  it('refuses session changes until storage is open', async () => {
    const { open } = slowStorage();
    const { session } = sessionOver([]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestSessionServices
        session={session}
        platform={testPlatform({ storage: { open } })}
      >
        <SessionsProvider>{children}</SessionsProvider>
      </TestSessionServices>
    );
    const { result } = renderHook(() => useSessions(), { wrapper });

    expect(result.current.list).toEqual({ status: 'loading' });
    expect(result.current.persistent).toBeUndefined();
    await expect(result.current.edit('a', { name: 'B' })).rejects.toThrow(
      'Storage is still being opened.',
    );
    await expect(result.current.remove('a')).rejects.toThrow(
      'Storage is still being opened.',
    );
    await expect(result.current.read('a')).rejects.toThrow(
      'Storage is still being opened.',
    );
  });
});
