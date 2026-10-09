// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { ReadCancelledError } from '@kb1rma/libcomm14cux-ts';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { recordedSource } from '../ecu/connect';
import { describeError } from '../ecu/errors';
import { useEcu } from '../ecu/useEcu';
import { useRecording } from '../recording/useRecording';
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
  downloadBytes,
  readRomImage,
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

/**
 * Reads the ECU's ROM image on request and keeps the saved images. It lives
 * above the dashboard's tabs, so a read carries on if the user changes view.
 */
export function RomsProvider({ children }: { children: ReactNode }) {
  const { state, ecu, pausePolling } = useEcu();
  const recording = useRecording();
  const storage = useStorage();
  const store = storage?.roms;
  const persistent = storage?.persistent ?? false;
  const [list, settled] = useStoreQuery(store, readList);
  const images = list.status === 'loaded' ? list.value.images : undefined;
  const unreadable = list.status === 'loaded' ? list.value.unreadable : NONE;
  const [progress, setProgress] = useState<RomProgress | undefined>(undefined);
  const [outcome, setOutcome] = useState<RomOutcome | undefined>(undefined);
  const readingRef = useRef(false);
  const cancelledRef = useRef(false);
  const source =
    state.status === 'idle' ? undefined : recordedSource(state.source);

  const read = useCallback(async () => {
    if (!ecu || !source || readingRef.current) {
      return;
    }

    readingRef.current = true;
    cancelledRef.current = false;
    setOutcome(undefined);

    const startedAt = Date.now();

    setProgress({
      bytesRead: 0,
      total: ROM_SIZE,
      startedAt,
      cancelling: false,
    });

    let resume = () => undefined as void;

    try {
      // Samples recorded while polling is paused would leave a gap that
      // replay could draw across, so the recording ends here.
      await recording.interrupt();
      resume = await pausePolling();
      const tune = await ecu.getTuneRevision();
      const bytes = await readRomImage(ecu, {
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
      const fileName = romFileName(source, tune.tuneNumber, tune.tuneIdent);
      const sha256 = await sha256Hex(bytes);
      const details = {
        source,
        readAt: Date.now(),
        tuneNumber: tune.tuneNumber,
        tuneIdent: tune.tuneIdent,
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

      downloadBytes(fileName, bytes);
      setOutcome({ kind: 'saved', fileName, image, kept });
    } catch (error) {
      setOutcome(
        error instanceof ReadCancelledError
          ? { kind: 'cancelled' }
          : { kind: 'failed', message: describeError(error) },
      );
    } finally {
      readingRef.current = false;
      setProgress(undefined);
      resume();
    }
  }, [ecu, source, store, settled, recording, pausePolling]);

  const cancel = useCallback(() => {
    if (!readingRef.current) {
      return;
    }

    cancelledRef.current = true;
    setProgress((previous) =>
      previous ? { ...previous, cancelling: true } : previous,
    );
    ecu?.cancelRead();
  }, [ecu]);

  const dismissOutcome = useCallback(() => {
    setOutcome(undefined);
  }, []);

  const download = useCallback(
    async (image: RomSummary) => {
      const bytes = await store?.read(image.id);

      if (bytes) {
        downloadBytes(
          romFileName(image.source, image.tuneNumber, image.tuneIdent),
          bytes,
        );
      } else {
        setOutcome({
          kind: 'failed',
          message: 'The saved image could not be read from the browser.',
        });
      }
    },
    [store],
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
