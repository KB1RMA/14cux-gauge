// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useId, useState } from 'react';
import {
  FAULT_CODE_NUMBERS,
  readFaultCodes,
  type FaultCodeFlags,
  type FaultCodeName,
} from '../ecu/reads';
import { useEcuRead } from '../ecu/useEcuRead';
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './Panel.module.css';
import { WriteBlocked, WriteResult } from './WriteStatus';

const FAULT_LABELS: Record<FaultCodeName, string> = {
  romChecksumFailure: 'ROM checksum failure',
  lambdaSensorOdd: 'Lambda sensor, odd bank',
  lambdaSensorEven: 'Lambda sensor, even bank',
  misfireGeneral: 'Misfire',
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

// Codes that only some firmware sets, so a technician knows why an ECU may
// never show them.
const FAULT_NOTES: Partial<Record<FaultCodeName, string>> = {
  misfireGeneral: 'set only by firmware before R3360',
};

// Two digits, as the factory lists and the fault code display write them ("02").
function faultNumber(name: FaultCodeName): string {
  return String(FAULT_CODE_NUMBERS[name]).padStart(2, '0');
}

// In the library's order, which is the firmware's fault priority order.
function activeFaults(codes: FaultCodeFlags): FaultCodeName[] {
  return (Object.keys(FAULT_CODE_NUMBERS) as FaultCodeName[]).filter(
    (name) => codes[name],
  );
}

export function FaultCodes() {
  const writes = useEcuWrite();
  const blockedId = useId();
  const { value, reading, error, read, clearError } =
    useEcuRead(readFaultCodes);
  const faults = value && activeFaults(value);
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
        <ul aria-label="Stored fault codes" className={styles['faults']}>
          {faults.map((name) => (
            <li key={name}>
              {faultNumber(name)} <span aria-hidden="true">·</span>{' '}
              {FAULT_LABELS[name]}
              {FAULT_NOTES[name] ? ` (${FAULT_NOTES[name]})` : null}{' '}
              <code>{name}</code>
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
