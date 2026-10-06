// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { ReadCancelledError } from '@kb1rma/libcomm14cux-ts';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { describeError } from '../ecu/errors';
import { useEcu } from '../ecu/useEcu';
import { useRecording } from '../recording/useRecording';
import { openRomStore } from '../storage/openRomStore';
import type { RomStore, RomSummary } from '../storage/romStore';
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

export interface RomsProviderProps {
  children: ReactNode;
  /** Opens the store; tests and the Electron app can supply their own. */
  open?: () => Promise<{ store: RomStore; persistent: boolean }>;
}

/**
 * Reads the ECU's ROM image on request and keeps the saved images. It lives
 * above the dashboard's tabs, so a read carries on if the user changes view.
 */
export function RomsProvider({
  children,
  open = openRomStore,
}: RomsProviderProps) {
  const { state, ecu, pausePolling } = useEcu();
  const recording = useRecording();
  const [store, setStore] = useState<RomStore | undefined>(undefined);
  const [persistent, setPersistent] = useState(false);
  const [images, setImages] = useState<RomSummary[] | undefined>(undefined);
  const [progress, setProgress] = useState<RomProgress | undefined>(undefined);
  const [outcome, setOutcome] = useState<RomOutcome | undefined>(undefined);
  const readingRef = useRef(false);
  const cancelledRef = useRef(false);
  const source = state.status === 'idle' ? undefined : state.source.kind;

  useEffect(() => {
    let opened: RomStore | undefined;
    let unmounted = false;

    void open().then(async (result) => {
      opened = result.store;

      if (unmounted) {
        opened.close();

        return;
      }

      setStore(result.store);
      setPersistent(result.persistent);
      setImages(await result.store.list().catch(() => []));
    });

    return () => {
      unmounted = true;
      opened?.close();
    };
  }, [open]);

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
          setImages(await store.list());
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
  }, [ecu, source, store, recording, pausePolling]);

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
    async (image: RomSummary) => {
      if (!store) {
        return;
      }

      await store.remove(image.id);
      setImages(await store.list());
    },
    [store],
  );

  const value = useMemo<RomsValue>(
    () => ({
      images,
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
