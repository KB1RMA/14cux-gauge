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

/** What came of a read, with the time it finished. */
type Outcome<T> = { readAt: number } & (
  { ok: true; value: T } | { ok: false; error: unknown }
);

async function settle<T>(read: () => Promise<T>): Promise<Outcome<T>> {
  try {
    const value = await read();

    return { ok: true, readAt: Date.now(), value };
  } catch (error) {
    return { ok: false, readAt: Date.now(), error };
  }
}

/**
 * The tune revision read on each connection, which has its own `Ecu`. It is
 * in the ROM, so it cannot change while connected: the ECU info and every
 * recording on the connection share one read, and keep when it was made. A
 * failed read is not kept, so the next asks the ECU again.
 */
const tuneRevisions = new WeakMap<Ecu, Promise<Outcome<TuneRevision>>>();

function readTuneRevision(ecu: Ecu): Promise<Outcome<TuneRevision>> {
  const kept = tuneRevisions.get(ecu);

  if (kept) {
    return kept;
  }

  const reading = settle(() => ecu.getTuneRevision());

  tuneRevisions.set(ecu, reading);
  void reading.then((outcome) => {
    if (!outcome.ok && tuneRevisions.get(ecu) === reading) {
      tuneRevisions.delete(ecu);
    }
  });

  return reading;
}

export const readTuneInfo: EcuRead<TuneInfo> = async (ecu) => {
  const tune = await readTuneRevision(ecu);

  if (!tune.ok) {
    throw tune.error;
  }

  const revision = tune.value;
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
 * What came of a read, as an identity keeps it: the value, `invalid` if
 * `allowInvalid` and the ECU gave a value its firmware cannot produce, or why
 * it failed.
 */
function identityRead<T>(
  outcome: Outcome<T>,
  allowInvalid: true,
): IdentityRead<T>;
function identityRead<T>(
  outcome: Outcome<T>,
  allowInvalid: false,
): Exclude<IdentityRead<T>, { status: 'invalid' }>;
function identityRead<T>(
  outcome: Outcome<T>,
  allowInvalid: boolean,
): IdentityRead<T> {
  const { readAt } = outcome;

  if (outcome.ok) {
    return { status: 'read', readAt, value: outcome.value };
  }

  if (allowInvalid && outcome.error instanceof InvalidReadingError) {
    return { status: 'invalid', readAt };
  }

  return { status: 'failed', readAt, message: describeError(outcome.error) };
}

/**
 * What a recording keeps of the ECU as it starts: its tune, rev limit, fuel
 * map in use and stored fault codes, each as the library returned it. The
 * tune is the one read on this connection (see {@link tuneRevisions}), with
 * when it was read; the rest are read now, as they are kept in the ECU's
 * RAM. Never throws; a value that could not be read is kept as failed, with
 * why.
 */
export const readIdentity: EcuRead<EcuIdentity> = async (ecu) => {
  const revision = identityRead(await readTuneRevision(ecu), false);
  const tune =
    revision.status === 'read'
      ? {
          ...revision,
          value: {
            tuneNumber: revision.value.tuneNumber,
            tuneIdent: revision.value.tuneIdent,
            checksumFixer: revision.value.checksumFixer,
          },
        }
      : revision;
  const rpmLimit = identityRead(await settle(() => ecu.getRPMLimit()), true);
  const fuelMap = identityRead(
    await settle(() => ecu.getCurrentFuelMap()),
    true,
  );
  const faultCodes = identityRead(
    await settle(async (): Promise<Record<string, boolean>> => ({
      ...(await ecu.getFaultCodes()),
    })),
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
