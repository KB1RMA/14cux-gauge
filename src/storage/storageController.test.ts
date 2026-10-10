// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IDBFactory } from 'fake-indexeddb';
import { memoryStorage, openStorage, type AppStorage } from './openStorage';
import { StorageController } from './storageController';

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

  return { storage, open, close, finish: () => finish() };
}

/** Another window upgrading the database the first one has open. */
async function upgradeElsewhere(factory: IDBFactory) {
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
}

describe('StorageController', () => {
  it('is opening until the storage has opened, then open', async () => {
    const { storage, open, finish } = slowStorage();
    const controller = new StorageController(open);
    const listener = vi.fn();

    controller.subscribe(listener);
    expect(controller.getSnapshot()).toEqual({ status: 'opening' });

    finish();
    await vi.waitFor(() => {
      expect(controller.getSnapshot()).toEqual({ status: 'open', storage });
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('opens the storage once, however many read it', async () => {
    const open = vi.fn(() => Promise.resolve(memoryStorage()));
    const controller = new StorageController(open);

    await vi.waitFor(() => {
      expect(controller.getSnapshot().status).toBe('open');
    });
    controller.getSnapshot();
    controller.getSnapshot();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('closes the storage on dispose', async () => {
    const { open, close, finish } = slowStorage();
    const controller = new StorageController(open);

    finish();
    await vi.waitFor(() => {
      expect(controller.getSnapshot().status).toBe('open');
    });
    controller.dispose();
    controller.dispose();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes storage that finishes opening after dispose', async () => {
    const { open, close, finish } = slowStorage();
    const controller = new StorageController(open);

    controller.dispose();
    finish();
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
    expect(controller.getSnapshot()).toEqual({ status: 'opening' });
  });

  it('is failed when the platform cannot open storage', async () => {
    const controller = new StorageController(() =>
      Promise.reject(new Error('no disk')),
    );

    await vi.waitFor(() => {
      expect(controller.getSnapshot()).toEqual({ status: 'failed' });
    });
  });

  it('is closed when another window upgrades the database', async () => {
    const factory = new IDBFactory();
    const controller = new StorageController(() => openStorage(factory));

    await vi.waitFor(() => {
      expect(controller.getSnapshot().status).toBe('open');
    });
    await upgradeElsewhere(factory);

    expect(controller.getSnapshot()).toEqual({ status: 'closed' });
    controller.dispose();
  });
});
