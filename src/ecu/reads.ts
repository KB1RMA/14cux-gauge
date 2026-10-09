// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  Ecu,
  FUEL_MAP_COLUMNS,
  FUEL_MAP_ROWS,
  InvalidReadingError,
  type FaultCodeName,
  type FaultCodes,
  type FuelMap,
  type TuneRevision,
} from '@kb1rma/libcomm14cux-ts';

export { FUEL_MAP_COLUMNS, FUEL_MAP_ROWS };
export type {
  FaultCodeName,
  FaultCodes as FaultCodeFlags,
  FuelMap,
  TuneRevision,
};

/**
 * A read the user or a view asks for, outside polling. Views run one through
 * `useEcuRead`, which keys its result by the connection.
 */
export type EcuRead<T> = (ecu: Ecu) => Promise<T>;

/** The version of comm14cux-ts, such as `0.1.0`. */
export function libraryVersion(): string {
  const { major, minor, patch } = Ecu.getLibraryVersion();

  return `${major}.${minor}.${patch}`;
}

export interface TuneInfo {
  revision: TuneRevision;
  /**
   * The rev limit in rpm, `null` if the tune holds an invalid one, or
   * `undefined` if it could not be read.
   */
  rpmLimit: number | null | undefined;
}

export const readTuneInfo: EcuRead<TuneInfo> = async (ecu) => {
  const revision = await ecu.getTuneRevision();
  const rpmLimit = await ecu.getRPMLimit().catch((e: unknown) => {
    if (e instanceof InvalidReadingError) {
      return null;
    }

    // Don't lose the tune revision over a failed rev limit read.
    return undefined;
  });

  return { revision, rpmLimit };
};

/** The stored fault codes, as flags by name. */
export const readFaultCodes: EcuRead<FaultCodes> = (ecu) => ecu.getFaultCodes();

export interface LoadedMap {
  id: number;
  map: FuelMap;
  /** Engine speed at the start of each column, lowest first. */
  rpm: number[];
}

/** The fuel map the ECU is using, and the engine speed of each column. */
export const readFuelMapInUse: EcuRead<LoadedMap> = async (ecu) => {
  const id = await ecu.getCurrentFuelMap();

  return {
    id,
    map: await ecu.getFuelMap(id),
    rpm: await ecu.getRpmTable(),
  };
};
