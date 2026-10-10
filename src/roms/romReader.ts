// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { recordedSource } from '../ecu/connect';
import { describeError } from '../ecu/errors';
import type { EcuSession, Lease } from '../ecu/session';
import type { UnreadableRecord } from '../model/record';
import type { RomSummary } from '../model/rom';
import type { FilePlatform } from '../platform/platform';
import { saveFile, type SaveFeedback } from '../platform/saveFile';
import type { Recorder } from '../recording/recorder';
import type { RomStore } from '../storage/romStore';
import type { StorageService } from '../storage/storageService';
import {
  cancelRomRead,
  isRomReadCancelled,
  readRom,
  ROM_READ_HOLDER,
  ROM_SIZE,
  romFileName,
  sha256Hex,
} from './romImage';

export interface RomProgress {
  bytesRead: number;
  total: number;
  /** `Date.now()` when the read started. */
  startedAt: number;
  /** The user has asked to stop; the read ends after the block in flight. */
  cancelling: boolean;
}

export type RomOutcome =
  | {
      kind: 'read';
      fileName: string;
      image: RomSummary;
      /** Whether a copy was kept in the browser; `false` if storage failed. */
      kept: boolean;
      /** Why the file was not saved; `undefined` once it was. */
      notSaved: SaveFeedback | undefined;
    }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

export interface RomReaderState {
  /** The saved images, newest first; `undefined` while storage opens. */
  images: RomSummary[] | undefined;
  /** Saved images that cannot be read, shown so they can be deleted. */
  unreadable: UnreadableRecord[];
  /** Whether saved images outlive the page; false when storage is unavailable. */
  persistent: boolean;
  /** Set while the image is being read. */
  progress: RomProgress | undefined;
  /** How the last read ended, until dismissed. */
  outcome: RomOutcome | undefined;
}

interface SavedImages {
  images: RomSummary[];
  unreadable: UnreadableRecord[];
}

/** The saved images; a list that cannot be read is shown as empty. */
async function readList(store: RomStore): Promise<SavedImages> {
  return {
    images: await store.list().catch(() => []),
    unreadable: await store.listUnreadable().catch(() => []),
  };
}

/** A ROM image is saved as raw bytes. */
const ROM_FILE_TYPE = 'application/octet-stream';

/**
 * Reads the ECU's ROM image on request and keeps the saved images. A read
 * holds the session's link, so it cannot start while a write runs, and no
 * write can start until it ends. It ends any recording first, which would
 * otherwise have a gap while polling is paused. The read belongs to this
 * controller, so it carries on if the user changes view.
 */
export class RomReader {
  private state: RomReaderState = {
    images: undefined,
    unreadable: [],
    persistent: false,
    progress: undefined,
    outcome: undefined,
  };

  private readonly listeners = new Set<() => void>();
  private readonly stopStorage: () => void;
  /** The store whose list is shown, and how to stop hearing from it. */
  private watched: { store: RomStore; stop: () => void } | undefined;
  /** The link, while a read holds it, and whether it has been cancelled. */
  private reading: { lease: Lease; cancelled: boolean } | undefined;
  /** The newest read of the list, settling once its result is shown. */
  private newest: Promise<void> = Promise.resolve();
  private ticket = 0;

  constructor(
    private readonly session: EcuSession,
    private readonly storage: StorageService,
    private readonly recorder: Pick<Recorder, 'interrupt'>,
    private readonly files: FilePlatform,
  ) {
    this.stopStorage = storage.subscribe(this.onStorage);
    this.onStorage();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): RomReaderState => this.state;

  /**
   * Ends any recording, pauses live polling, reads the ROM image, keeps a
   * copy in the browser and saves it as a file.
   */
  readonly read = async (): Promise<void> => {
    const { connection } = this.session.getSnapshot();

    if (connection.status === 'idle') {
      return;
    }

    const source = recordedSource(connection.source);
    const lease = this.session.acquire(ROM_READ_HOLDER, () =>
      this.recorder.interrupt(),
    );

    if (!lease) {
      // The button is disabled while a write holds the link, so only a write
      // that started after the read was confirmed gets here.
      if (this.session.getSnapshot().holder?.kind === 'write') {
        this.set({
          outcome: {
            kind: 'failed',
            message:
              'The ROM image was not read: a write to the ECU started first. Try again when it finishes.',
          },
        });
      }

      return;
    }

    const reading = { lease, cancelled: false };
    const startedAt = Date.now();

    this.reading = reading;
    this.set({
      outcome: undefined,
      progress: {
        bytesRead: 0,
        total: ROM_SIZE,
        startedAt,
        cancelling: false,
      },
    });

    try {
      await lease.ready;

      const { tuneNumber, tuneIdent, bytes } = await readRom(lease.ecu, {
        onProgress: (bytesRead, total) => {
          this.set({
            progress: {
              bytesRead,
              total,
              startedAt,
              cancelling: reading.cancelled,
            },
          });
        },
        isCancelled: () => reading.cancelled,
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
      const store = this.storage.getSnapshot()?.roms;

      if (store) {
        try {
          image = await store.save({ ...details, bytes });
          kept = true;
          await this.settled();
        } catch {
          // Still save the file; the outcome says no copy was kept.
        }
      }

      // Never rejects: a file that was not saved is not a failed read.
      const notSaved = await saveFile(
        this.files,
        fileName,
        bytes,
        ROM_FILE_TYPE,
      );

      this.set({
        outcome: { kind: 'read', fileName, image, kept, notSaved },
      });
    } catch (error) {
      this.set({
        outcome: isRomReadCancelled(error)
          ? { kind: 'cancelled' }
          : { kind: 'failed', message: describeError(error) },
      });
    } finally {
      this.reading = undefined;
      this.set({ progress: undefined });
      lease.release();
    }
  };

  /** Stops a read in progress. */
  readonly cancel = (): void => {
    const reading = this.reading;

    if (!reading) {
      return;
    }

    reading.cancelled = true;
    this.set({
      progress: this.state.progress && {
        ...this.state.progress,
        cancelling: true,
      },
    });
    cancelRomRead(reading.lease.ecu);
  };

  readonly dismissOutcome = (): void => {
    this.set({ outcome: undefined });
  };

  /** Saves a kept image as a file again; says so only if that fails. */
  readonly download = async (image: RomSummary): Promise<void> => {
    const bytes = await this.storage.getSnapshot()?.roms.read(image.id);

    if (bytes) {
      const notSaved = await saveFile(
        this.files,
        romFileName(image.source, image.tuneNumber, image.tuneIdent),
        bytes,
        ROM_FILE_TYPE,
      );

      // Dismissing a Save dialog needs no message: the user chose it.
      if (notSaved?.kind === 'failed') {
        this.set({ outcome: { kind: 'failed', message: notSaved.message } });
      }
    } else {
      this.set({
        outcome: {
          kind: 'failed',
          message: 'The saved image could not be read from the browser.',
        },
      });
    }
  };

  /** Deletes a saved image, readable or not, by its `id`. */
  readonly remove = async (id: string): Promise<void> => {
    const store = this.storage.getSnapshot()?.roms;

    if (!store) {
      return;
    }

    await store.remove(id);
    await this.settled();
  };

  /** Stops following the storage. */
  dispose(): void {
    this.stopStorage();
    this.watched?.stop();
    this.watched = undefined;
    this.listeners.clear();
  }

  /** Follows the open store, and lists its images again as it changes. */
  private readonly onStorage = (): void => {
    const storage = this.storage.getSnapshot();
    const store = storage?.roms;

    this.set({ persistent: storage?.persistent ?? false });

    if (store === this.watched?.store) {
      return;
    }

    this.watched?.stop();
    this.watched = store && { store, stop: store.subscribe(this.load) };

    if (store) {
      this.load();
    } else {
      this.set({ images: undefined, unreadable: [] });
    }
  };

  private readonly load = (): void => {
    const store = this.watched?.store;

    if (!store) {
      return;
    }

    const ticket = ++this.ticket;

    // Only the newest read counts; an older one may settle after it.
    this.newest = readList(store).then((list) => {
      if (ticket === this.ticket && this.watched?.store === store) {
        this.set({ images: list.images, unreadable: list.unreadable });
      }
    });
  };

  /**
   * Resolves once the list reflects every change the store has reported so
   * far, so that whatever happens next sees the change.
   */
  private async settled(): Promise<void> {
    let awaited: Promise<void>;

    // A change reported meanwhile starts a newer read; wait for that too.
    do {
      awaited = this.newest;
      await awaited;
    } while (awaited !== this.newest);
  }

  private set(change: Partial<RomReaderState>): void {
    const next = { ...this.state, ...change };
    const keys = Object.keys(next) as (keyof RomReaderState)[];

    if (keys.every((key) => next[key] === this.state[key])) {
      return;
    }

    this.state = next;

    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
