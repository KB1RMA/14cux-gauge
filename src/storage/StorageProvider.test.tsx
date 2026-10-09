// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionsProvider } from '../sessions/SessionsProvider';
import { useSessions } from '../sessions/useSessions';
import { memoryStorage, type AppStorage } from './openStorage';
import { StorageProvider } from './StorageProvider';

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

describe('StorageProvider', () => {
  it('closes storage that finishes opening after the app has gone', async () => {
    const { open, close, finish } = slowStorage();
    const { unmount } = render(
      <StorageProvider open={open}>{null}</StorageProvider>,
    );

    unmount();
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes storage when the app goes', async () => {
    const storage = memoryStorage();
    const close = vi.spyOn(storage, 'close');
    const { unmount } = render(
      <StorageProvider open={() => Promise.resolve(storage)}>
        {null}
      </StorageProvider>,
    );

    await act(() => Promise.resolve());
    unmount();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('refuses session changes until storage is open', async () => {
    const { open } = slowStorage();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StorageProvider open={open}>
        <SessionsProvider>{children}</SessionsProvider>
      </StorageProvider>
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
