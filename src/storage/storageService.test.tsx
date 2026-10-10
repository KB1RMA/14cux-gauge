// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { sessionOver } from '../test-support/ecuSession';
import { testPlatform } from '../test-support/platform';
import { TestSessionServices } from '../test-support/TestApp';
import { SessionsProvider } from '../sessions/SessionsProvider';
import { useSessions } from '../sessions/useSessions';
import { memoryStorage, type AppStorage } from './openStorage';
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
    await Promise.resolve();
    await Promise.resolve();

    expect(service.getSnapshot()).toBeDefined();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('closes storage that finishes opening after the app has gone', async () => {
    const { open, close, finish } = slowStorage();
    const service = new StorageService(open);

    service.dispose();
    finish();
    await Promise.resolve();
    await Promise.resolve();

    expect(close).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()).toBeUndefined();
  });

  it('closes storage when the app goes', async () => {
    const storage = memoryStorage();
    const close = vi.spyOn(storage, 'close');
    const service = new StorageService(() => Promise.resolve(storage));

    await Promise.resolve();
    await Promise.resolve();
    service.dispose();

    expect(close).toHaveBeenCalledTimes(1);
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
