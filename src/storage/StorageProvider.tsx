// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useState, type ReactNode } from 'react';
import { StorageContext } from './context';
import { openStorage, type AppStorage } from './openStorage';

export interface StorageProviderProps {
  children: ReactNode;
  /** Opens the storage; tests and the Electron app can supply their own. */
  open?: () => Promise<AppStorage>;
}

/** Opens the sessions and ROM image stores once, and closes them on unmount. */
export function StorageProvider({
  children,
  open = openStorage,
}: StorageProviderProps) {
  const [storage, setStorage] = useState<AppStorage | undefined>(undefined);

  useEffect(() => {
    let opened: AppStorage | undefined;
    let unmounted = false;

    void open().then((result) => {
      opened = result;

      if (unmounted) {
        result.close();

        return;
      }

      setStorage(result);
    });

    return () => {
      unmounted = true;
      opened?.close();
    };
  }, [open]);

  return <StorageContext value={storage}>{children}</StorageContext>;
}
