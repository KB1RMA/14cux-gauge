// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { recordedSource } from '../ecu/connect';
import { describeError } from '../ecu/errors';
import type { Lease } from '../ecu/session';
import { useEcu } from '../ecu/useEcu';
import { useEcuSession } from '../ecu/useEcuSession';
import { usePlatform } from '../platform/usePlatform';
import type { UnreadableRecord } from '../model/record';
import type { RomSummary } from '../model/rom';
import type { RomStore } from '../storage/romStore';
import { useStorage } from '../storage/useStorage';
import { useStoreQuery } from '../storage/useStoreQuery';
import {
  RomsContext,
  type RomOutcome,
  type RomProgress,
  type RomsValue,
} from './context';
import {
  cancelRomRead,
  isRomReadCancelled,
  readRom,
  ROM_READ_HOLDER,
  ROM_SIZE,
  romFileName,
  sha256Hex,
} from './romImage';

/** The saved images; a list that cannot be read is shown as empty. */
async function readList(store: RomStore) {
  return {
    images: await store.list().catch(() => []),
    unreadable: await store.listUnreadable().catch(() => []),
  };
}

const NONE: UnreadableRecord[] = [];

/** A ROM image is saved as raw bytes. */
const ROM_FILE_TYPE = 'application/octet-stream';

/**
 * Reads the ECU's ROM image on request and keeps the saved images. It lives
 * above the dashboard's tabs, so a read carries on if the user changes view.
 * A read holds the ECU session's link, so it cannot start while a write
 * runs, and no write can start until it ends.
 */
export function RomsProvider({ children }: { children: ReactNode }) {
  const session = useEcuSession();
  const { state } = useEcu();
  const { files } = usePlatform();
  const storage = useStorage();
  const store = storage?.roms;
  const persistent = storage?.persistent ?? false;
  const [list, settled] = useStoreQuery(store, readList);
  const images = list.status === 'loaded' ? list.value.images : undefined;
  const unreadable = list.status === 'loaded' ? list.value.unreadable : NONE;
  const [progress, setProgress] = useState<RomProgress | undefined>(undefined);
  const [outcome, setOutcome] = useState<RomOutcome | undefined>(undefined);
  // The link, while a read holds it.
  const leaseRef = useRef<Lease | undefined>(undefined);
  const cancelledRef = useRef(false);
  const source =
    state.status === 'idle' ? undefined : recordedSource(state.source);

  const read = useCallback(async () => {
    if (!source) {
      return;
    }

    const lease = session.acquire(ROM_READ_HOLDER);

    if (!lease) {
      // The button is disabled while a write holds the link, so only a write
      // that started after the read was confirmed gets here.
      if (session.getSnapshot().holder?.kind === 'write') {
        setOutcome({
          kind: 'failed',
          message:
            'The ROM image was not read: a write to the ECU started first. Try again when it finishes.',
        });
      }

      return;
    }

    leaseRef.current = lease;
    cancelledRef.current = false;
    setOutcome(undefined);

    const startedAt = Date.now();

    setProgress({
      bytesRead: 0,
      total: ROM_SIZE,
      startedAt,
      cancelling: false,
    });

    try {
      await lease.ready;

      const { tuneNumber, tuneIdent, bytes } = await readRom(lease.ecu, {
        onProgress: (bytesRead, total) => {
          setProgress({
            bytesRead,
            total,
            startedAt,
            cancelling: cancelledRef.current,
          });
        },
        isCancelled: () => cancelledRef.current,
      });
      const fileName = romFileName(source, tuneNumber, tuneIdent);
      const sha256 = await sha256Hex(bytes);
      const details = {
        source,
        readAt: Date.now(),
        tuneNumber,
        tuneIdent,
        sha256,
      };
      let image: RomSummary = { ...details, id: '', size: bytes.length };
      let kept = false;

      if (store) {
        try {
          image = await store.save({ ...details, bytes });
          kept = true;
          await settled();
        } catch {
          // Still download it; the outcome says no copy was kept.
        }
      }

      await files.save(fileName, bytes, ROM_FILE_TYPE);
      setOutcome({ kind: 'saved', fileName, image, kept });
    } catch (error) {
      setOutcome(
        isRomReadCancelled(error)
          ? { kind: 'cancelled' }
          : { kind: 'failed', message: describeError(error) },
      );
    } finally {
      leaseRef.current = undefined;
      setProgress(undefined);
      lease.release();
    }
  }, [session, source, store, settled, files]);

  const cancel = useCallback(() => {
    const lease = leaseRef.current;

    if (!lease) {
      return;
    }

    cancelledRef.current = true;
    setProgress((previous) =>
      previous ? { ...previous, cancelling: true } : previous,
    );
    cancelRomRead(lease.ecu);
  }, []);

  const dismissOutcome = useCallback(() => {
    setOutcome(undefined);
  }, []);

  const download = useCallback(
    async (image: RomSummary) => {
      const bytes = await store?.read(image.id);

      if (bytes) {
        await files.save(
          romFileName(image.source, image.tuneNumber, image.tuneIdent),
          bytes,
          ROM_FILE_TYPE,
        );
      } else {
        setOutcome({
          kind: 'failed',
          message: 'The saved image could not be read from the browser.',
        });
      }
    },
    [store, files],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!store) {
        return;
      }

      await store.remove(id);
      await settled();
    },
    [store, settled],
  );

  const value = useMemo<RomsValue>(
    () => ({
      images,
      unreadable,
      persistent,
      progress,
      outcome,
      read,
      cancel,
      dismissOutcome,
      download,
      remove,
    }),
    [
      images,
      unreadable,
      persistent,
      progress,
      outcome,
      read,
      cancel,
      dismissOutcome,
      download,
      remove,
    ],
  );

  return <RomsContext value={value}>{children}</RomsContext>;
}
