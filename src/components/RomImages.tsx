// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { DownloadIcon } from '@radix-ui/react-icons';
import { useId, useRef, useState } from 'react';
import { useEcu } from '../ecu/useEcu';
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { hex } from '../hex';
import { useRecording } from '../recording/useRecording';
import type { RomOutcome } from '../roms/context';
import { useRoms } from '../roms/useRoms';
import { formatDateTime } from '../sessions/format';
import type { UnreadableRecord } from '../model/record';
import type { RomSummary } from '../model/rom';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './RomImages.module.css';
import panel from './Panel.module.css';
import { RomProgressDialog } from './RomProgressDialog';
import { WriteBlocked } from './WriteStatus';

const SYNTHETIC = 'Demo ECU: a synthetic image, not real ROM data.';

function tuneName({ tuneNumber, tuneIdent }: RomSummary): string {
  return `Tune ${tuneNumber.toString().padStart(4, '0')}, ident ${hex(tuneIdent, 4)}`;
}

function Outcome({
  outcome,
  onDismiss,
}: {
  outcome: RomOutcome;
  onDismiss(): void;
}) {
  const dismiss = (
    <button type="button" onClick={onDismiss}>
      Dismiss
    </button>
  );

  switch (outcome.kind) {
    case 'read': {
      const label =
        outcome.image.source === 'demo' ? (
          <p className={styles['label']}>{SYNTHETIC}</p>
        ) : null;

      if (outcome.notSaved === undefined) {
        return (
          <div aria-live="polite">
            <p>
              Downloaded {outcome.fileName}.{' '}
              {outcome.kept
                ? 'A copy is kept in this browser.'
                : 'A copy could not be kept in this browser.'}
            </p>
            {label}
            {dismiss}
          </div>
        );
      }

      // The image was read, but the file was not saved: say so, and where
      // the image can still be found, rather than look like a success.
      const kept = outcome.kept
        ? 'A copy is kept in this browser; download it from the list below.'
        : 'A copy could not be kept in this browser either, so nothing was saved.';

      return outcome.notSaved.kind === 'cancelled' ? (
        <div aria-live="polite">
          <p>
            The ROM image was read, but {outcome.fileName} was not saved: the
            save was cancelled. {kept}
          </p>
          {label}
          {dismiss}
        </div>
      ) : (
        <div role="alert" className={panel['error']}>
          <p>
            The ROM image was read, but {outcome.notSaved.message} {kept}
          </p>
          {label}
          {dismiss}
        </div>
      );
    }

    case 'cancelled':
      return (
        <div aria-live="polite">
          <p>The read was cancelled. Nothing was saved.</p>
          {dismiss}
        </div>
      );
    case 'failed':
      return (
        <div role="alert" className={panel['error']}>
          <p>{outcome.message} Nothing was saved.</p>
          {dismiss}
        </div>
      );
  }
}

/**
 * Saves the ECU's ROM image as a file, and lists the images read before,
 * which are kept in the browser.
 */
export function RomImages() {
  const { state, holder } = useEcu();
  const demo = state.status !== 'idle' && state.source.kind === 'demo';
  const roms = useRoms();
  const { active: recording } = useRecording();
  // The ROM cannot be read until whatever holds the link lets go. Only a
  // write can hold it while this button shows, and the note names it.
  const { running } = useEcuWrite();
  const blockedId = useId();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState<
    RomSummary | UnreadableRecord | undefined
  >(undefined);
  const saveRef = useRef<HTMLButtonElement>(null);
  const reading = roms.progress !== undefined;

  return (
    <section className={panel['panel']} aria-labelledby="rom-images-title">
      <h2 id="rom-images-title">ROM image</h2>
      <p className={styles['hint']}>
        The ECU’s firmware, which holds the tune. A copy is useful as a backup,
        to identify a chip, to compare tunes, or to send to a tuner. Reading it
        does not change anything in the ECU.
      </p>

      {roms.outcome ? (
        <Outcome outcome={roms.outcome} onDismiss={roms.dismissOutcome} />
      ) : null}

      <WriteBlocked noteId={blockedId} />
      <div className={panel['actions']}>
        <button
          ref={saveRef}
          type="button"
          disabled={reading || holder !== undefined}
          aria-describedby={running === undefined ? undefined : blockedId}
          onClick={() => {
            setConfirming(true);
          }}
        >
          <DownloadIcon aria-hidden="true" />
          Save ROM image
        </button>
      </div>

      {roms.images === undefined ? null : roms.images.length === 0 &&
        roms.unreadable.length === 0 ? (
        <p className={styles['hint']}>
          No images are kept in this browser yet.
        </p>
      ) : (
        <ul aria-label="Saved ROM images" className={styles['list']}>
          {roms.images.map((image) => (
            <li key={image.id} className={styles['item']}>
              <span className={styles['name']}>{tuneName(image)}</span>
              {image.source === 'demo' ? (
                <p className={styles['label']}>{SYNTHETIC}</p>
              ) : null}
              <p className={styles['details']}>
                Read {formatDateTime(image.readAt)} ·{' '}
                {image.size.toLocaleString()} bytes
              </p>
              {image.sha256 ? (
                <p className={styles['details']}>
                  SHA-256 <span className={styles['hash']}>{image.sha256}</span>
                </p>
              ) : null}
              <div className={panel['actions']}>
                <button
                  type="button"
                  aria-label={`Download ${tuneName(image)}, read ${formatDateTime(image.readAt)}`}
                  onClick={() => void roms.download(image)}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="danger"
                  aria-label={`Delete ${tuneName(image)}, read ${formatDateTime(image.readAt)}`}
                  onClick={() => {
                    setDeleting(image);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {roms.unreadable.map((unreadable) => (
            <li key={unreadable.id} className={styles['item']}>
              <span className={styles['name']}>Image that can’t be read</span>
              <p className={styles['details']}>
                {unreadable.detail}. Its ID is{' '}
                <span className={styles['hash']}>{unreadable.id}</span>.
              </p>
              <div className={panel['actions']}>
                <button
                  type="button"
                  className="danger"
                  aria-label={`Delete image that can’t be read, ${unreadable.id}`}
                  onClick={() => {
                    setDeleting(unreadable);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {roms.images && roms.images.length > 0 && !roms.persistent ? (
        <p className={styles['hint']}>
          This browser is not keeping data, so these images last only until the
          page is closed.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Read the ROM image?"
        confirmLabel="Read ROM image"
        tone="primary"
        onConfirm={() => {
          setConfirming(false);
          void roms.read();
        }}
        onCancel={() => {
          setConfirming(false);
        }}
      >
        <p>
          The ECU sends its ROM over the slow diagnostic link, which takes about
          half a minute. Nothing else can use the link meanwhile, so:
        </p>
        <ul>
          <li>
            Live readings stop and stay blank until the read finishes. Graphs
            will show a gap.
          </li>
          {recording ? (
            <li>
              The recording in progress stops and is saved with the readings
              taken so far. Start a new one afterwards.
            </li>
          ) : null}
        </ul>
        <p>
          The image is downloaded as a .bin file, and a copy is kept in this
          browser.
        </p>
        {demo ? <p>{SYNTHETIC}</p> : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting !== undefined}
        title="Delete this ROM image?"
        confirmLabel="Delete image"
        onConfirm={() => {
          if (deleting) {
            void roms.remove(deleting.id);
          }

          setDeleting(undefined);
        }}
        onCancel={() => {
          setDeleting(undefined);
        }}
      >
        <p>
          {deleting === undefined
            ? ''
            : 'detail' in deleting
              ? 'This image, which cannot be read,'
              : tuneName(deleting)}{' '}
          will be deleted from this browser. This cannot be undone, and the ECU
          is not changed. Any file you downloaded is kept.
        </p>
      </ConfirmDialog>

      <RomProgressDialog
        progress={roms.progress}
        returnFocusTo={saveRef}
        onCancel={roms.cancel}
      />
    </section>
  );
}
