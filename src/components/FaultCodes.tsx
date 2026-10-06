// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type {
  Ecu,
  FaultCodeName,
  FaultCodes as FaultCodeFlags,
} from '@kb1rma/libcomm14cux-ts';
import { useCallback, useId, useState } from 'react';
import { describeError } from '../ecu/errors';
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './Panel.module.css';
import { WriteBlocked, WriteResult } from './WriteStatus';

const FAULT_LABELS: Record<FaultCodeName, string> = {
  romChecksumFailure: 'ROM checksum failure',
  lambdaSensorOdd: 'Lambda sensor, odd bank',
  lambdaSensorEven: 'Lambda sensor, even bank',
  misfireOddBank: 'Misfire, odd bank',
  misfireEvenBank: 'Misfire, even bank',
  airflowMeter: 'Airflow meter',
  tuneResistorOutOfRange: 'Tune resistor out of range',
  injectorOddBank: 'Injector, odd bank',
  injectorEvenBank: 'Injector, even bank',
  coolantTempSensor: 'Coolant temperature sensor',
  throttlePot: 'Throttle potentiometer',
  throttlePotHiMafLo: 'Throttle pot high / MAF low',
  throttlePotLoMafHi: 'Throttle pot low / MAF high',
  purgeValveLeak: 'Purge valve leak',
  mixtureTooLean: 'Mixture too lean',
  intakeAirLeak: 'Intake air leak',
  lowFuelPressure: 'Low fuel pressure',
  idleValveStepperMotor: 'Idle valve stepper motor',
  roadSpeedSensor: 'Road speed sensor',
  neutralSwitch: 'Neutral switch',
  lowFuelPressureOrAirLeak: 'Low fuel pressure or air leak',
  fuelTempSensor: 'Fuel temperature sensor',
  batteryDisconnected: 'Battery disconnected',
  ramChecksumFailure: 'RAM checksum failure',
};

function activeFaults(codes: FaultCodeFlags): FaultCodeName[] {
  return (Object.keys(FAULT_LABELS) as FaultCodeName[]).filter(
    (name) => codes[name],
  );
}

export function FaultCodes({ ecu }: { ecu: Ecu }) {
  const writes = useEcuWrite();
  const blockedId = useId();
  const [faults, setFaults] = useState<FaultCodeName[] | undefined>(undefined);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const clearing = writes.running === 'clearFaultCodes';
  const blocked = writes.running !== undefined && !clearing;

  const read = useCallback(async () => {
    setReading(true);
    setError(undefined);

    try {
      setFaults(activeFaults(await ecu.getFaultCodes()));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setReading(false);
    }
  }, [ecu]);

  const clear = async () => {
    setConfirming(false);
    setError(undefined);

    const cleared = await writes.run('clearFaultCodes', async (target) => {
      await target.clearFaultCodes();

      return 'Fault codes cleared.';
    });

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
        <ul aria-label="Stored fault codes" className={styles['faults']}>
          {faults.map((name) => (
            <li key={name}>
              {FAULT_LABELS[name]} <code>{name}</code>
            </li>
          ))}
        </ul>
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
