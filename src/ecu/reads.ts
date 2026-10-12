// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  Ecu,
  FAULT_CODE_NUMBERS,
  FUEL_MAP_COLUMNS,
  FUEL_MAP_ROWS,
  InvalidReadingError,
  type FaultCodeName,
  type FaultCodes,
  type FuelMap,
  type TuneRevision,
} from '@kb1rma/libcomm14cux-ts';
import type { EcuIdentity, IdentityRead } from '../model/identity';
import { describeError } from './errors';

export { FAULT_CODE_NUMBERS, FUEL_MAP_COLUMNS, FUEL_MAP_ROWS };
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

/**
 * Runs `read` and keeps what came of it, with the time it finished: the
 * value, `invalid` if `allowInvalid` and the ECU gave a value its firmware
 * cannot produce, or why it failed.
 */
async function attempt<T>(
  read: () => Promise<T>,
  allowInvalid: true,
): Promise<IdentityRead<T>>;
async function attempt<T>(
  read: () => Promise<T>,
  allowInvalid: false,
): Promise<Exclude<IdentityRead<T>, { status: 'invalid' }>>;
async function attempt<T>(
  read: () => Promise<T>,
  allowInvalid: boolean,
): Promise<IdentityRead<T>> {
  try {
    const value = await read();

    return { status: 'read', readAt: Date.now(), value };
  } catch (e) {
    if (allowInvalid && e instanceof InvalidReadingError) {
      return { status: 'invalid', readAt: Date.now() };
    }

    return { status: 'failed', readAt: Date.now(), message: describeError(e) };
  }
}

/**
 * What a recording keeps of the ECU as it starts: its tune, rev limit, fuel
 * map in use and stored fault codes, each as the library returned it. Never
 * throws; a value that could not be read is kept as failed, with why.
 */
export const readIdentity: EcuRead<EcuIdentity> = async (ecu) => {
  const tune = await attempt(async () => {
    const { tuneNumber, tuneIdent, checksumFixer } =
      await ecu.getTuneRevision();

    return { tuneNumber, tuneIdent, checksumFixer };
  }, false);
  const rpmLimit = await attempt(() => ecu.getRPMLimit(), true);
  const fuelMap = await attempt(() => ecu.getCurrentFuelMap(), true);
  const faultCodes = await attempt(
    async (): Promise<Record<string, boolean>> => ({
      ...(await ecu.getFaultCodes()),
    }),
    false,
  );

  return { tune, rpmLimit, fuelMap, faultCodes };
};

/** An identity none of which was read, each value failed for `message`. */
export function identityNotRead(message: string, at: number): EcuIdentity {
  const failed = { status: 'failed', readAt: at, message } as const;

  return {
    tune: failed,
    rpmLimit: failed,
    fuelMap: failed,
    faultCodes: failed,
  };
}
