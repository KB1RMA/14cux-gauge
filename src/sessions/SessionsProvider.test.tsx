// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StorageController } from '../storage/storageController';
import { StorageProvider } from '../storage/StorageProvider';
import { SessionsProvider } from './SessionsProvider';
import { useSessions } from './useSessions';

describe('SessionsProvider', () => {
  it('refuses session changes until storage is open', async () => {
    const controller = new StorageController(() => new Promise(() => {}));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StorageProvider controller={controller}>
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
