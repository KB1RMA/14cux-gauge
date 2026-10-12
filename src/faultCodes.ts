// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  FAULT_CODE_NUMBERS,
  type FaultCodeName,
  type FaultCodes,
} from '@kb1rma/libcomm14cux-ts';

/**
 * How fault codes read, defined once so the live list, a recording's page
 * and its export name them the same way.
 */

export const FAULT_LABELS: Record<FaultCodeName, string> = {
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

/** A fault code as a list shows it. */
export interface FaultDescription {
  /** The library's name for it. */
  name: string;
  /**
   * Two digits, as the factory lists and the fault code display write them
   * ("02"); `undefined` for a code this version of the app does not know.
   */
  number: string | undefined;
  /** What it means, with any note on the firmware that sets it. */
  label: string;
}

function isKnown(name: string): name is FaultCodeName {
  return Object.hasOwn(FAULT_CODE_NUMBERS, name);
}

export function describeFault(name: string): FaultDescription {
  if (!isKnown(name)) {
    // Recorded by a newer version: keep it, named as it was recorded.
    return { name, number: undefined, label: 'Unknown fault code' };
  }

  const note = FAULT_NOTES[name];

  return {
    name,
    number: String(FAULT_CODE_NUMBERS[name]).padStart(2, '0'),
    label: note ? `${FAULT_LABELS[name]} (${note})` : FAULT_LABELS[name],
  };
}

/**
 * The codes set in `flags`, in the library's order, which is the firmware's
 * fault priority order; any it does not know follow, in the order given.
 */
export function activeFaults(
  flags: FaultCodes | Readonly<Record<string, boolean>>,
): FaultDescription[] {
  const set = new Set(
    Object.entries(flags)
      .filter(([, on]) => on === true)
      .map(([name]) => name),
  );
  const known = (Object.keys(FAULT_CODE_NUMBERS) as FaultCodeName[]).filter(
    (name) => set.has(name),
  );
  const unknown = [...set].filter((name) => !isKnown(name));

  return [...known, ...unknown].map(describeFault);
}
