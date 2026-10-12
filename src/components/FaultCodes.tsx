// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useId, useState } from 'react';
import { readFaultCodes } from '../ecu/reads';
import { useEcuRead } from '../ecu/useEcuRead';
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { activeFaults } from '../faultCodes';
import { ConfirmDialog } from './ConfirmDialog';
import { FaultList } from './FaultList';
import styles from './Panel.module.css';
import { WriteBlocked, WriteResult } from './WriteStatus';

export function FaultCodes() {
  const writes = useEcuWrite();
  const blockedId = useId();
  const { value, reading, error, read, clearError } =
    useEcuRead(readFaultCodes);
  const faults = value && activeFaults({ ...value });
  const [confirming, setConfirming] = useState(false);
  const clearing = writes.running === 'clearFaultCodes';
  const blocked = writes.running !== undefined && !clearing;

  const clear = async () => {
    setConfirming(false);
    clearError();

    const cleared = await writes.run({ id: 'clearFaultCodes' });

    if (cleared) {
      await read();
    }
  };

  const cancel = useCallback(() => {
    setConfirming(false);
  }, []);

  return (
    <section className={styles['panel']} aria-labelledby="fault-codes-title">
      <h2 id="fault-codes-title">Fault codes</h2>

      {faults === undefined ? (
        <p className={styles['muted']}>Not read yet.</p>
      ) : faults.length === 0 ? (
        <p>No fault codes stored.</p>
      ) : (
        <FaultList faults={faults} label="Stored fault codes" />
      )}

      {error ? (
        <p role="alert" className={styles['error']}>
          {error}
        </p>
      ) : null}
      <WriteResult id="clearFaultCodes" />
      <WriteBlocked id="clearFaultCodes" noteId={blockedId} />

      <div className={styles['actions']}>
        <button
          type="button"
          disabled={reading || clearing}
          onClick={() => void read()}
        >
          {reading ? 'Reading…' : 'Read fault codes'}
        </button>
        <button
          type="button"
          className="danger"
          disabled={reading || writes.running !== undefined}
          aria-describedby={blocked ? blockedId : undefined}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {clearing ? 'Clearing…' : 'Clear fault codes'}
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Clear fault codes?"
        confirmLabel="Clear fault codes"
        writesToEcu
        onConfirm={() => void clear()}
        onCancel={cancel}
      >
        <p>
          This writes to the ECU&apos;s memory, erasing every stored fault code.
          The codes cannot be recovered, so note them first if you need them for
          diagnosis.
        </p>
      </ConfirmDialog>
    </section>
  );
}
