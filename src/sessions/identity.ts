// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { activeFaults, type FaultDescription } from '../faultCodes';
import { hex } from '../hex';
import type { EcuIdentity, IdentityRead } from '../model/identity';

/**
 * How the ECU's identity reads, defined once so the live ECU info, a
 * recording's page and its export show the same values the same way.
 */

/** Four digits, as the tune is known ("0360"). */
export function formatTuneNumber(tuneNumber: number): string {
  return tuneNumber.toString().padStart(4, '0');
}

export function formatTuneIdent(tuneIdent: number): string {
  return hex(tuneIdent, 4);
}

export function formatChecksumFixer(checksumFixer: number): string {
  return hex(checksumFixer, 2);
}

/** What a stored value says when it is not a value. */
export const NOT_VALID = 'Not valid';
export const NOT_RECORDED = 'Not recorded';

/** One value of the identity, as a recording's page and export show it. */
export interface IdentityRow {
  label: string;
  /** Whether `value` is the value read, or what became of the read. */
  status: IdentityRead<unknown>['status'];
  /** The unit of the value, if it has one. */
  unit: string | undefined;
  /** The value without its unit, or what became of the read. */
  value: string;
  /** `Date.now()` when it was read, or the read failed. */
  readAt: number;
}

function row<T>(
  label: string,
  read: IdentityRead<T>,
  format: (value: T) => string,
  unit?: string,
): IdentityRow {
  const { status, readAt } = read;

  switch (read.status) {
    case 'read':
      return { label, status, unit, value: format(read.value), readAt };
    case 'invalid':
      return { label, status, unit, value: NOT_VALID, readAt };
    case 'failed':
      return { label, status, unit, value: notRead(read.message), readAt };
  }
}

/** Why a value is missing, for the user. */
export function notRead(message: string): string {
  return `Not read: ${message}`;
}

/** A value with its unit, if it was read and has one. */
export function withUnit({ status, value, unit }: IdentityRow): string {
  return status === 'read' && unit ? `${value} ${unit}` : value;
}

/** The tune, rev limit and fuel map, in that order. */
export function identityRows(identity: EcuIdentity): IdentityRow[] {
  const { tune } = identity;

  return [
    row('Tune number', tune, ({ tuneNumber }) => formatTuneNumber(tuneNumber)),
    row('Tune ident', tune, ({ tuneIdent }) => formatTuneIdent(tuneIdent)),
    row('Checksum fixer', tune, ({ checksumFixer }) =>
      formatChecksumFixer(checksumFixer),
    ),
    row('Rev limit', identity.rpmLimit, String, 'rpm'),
    row('Fuel map', identity.fuelMap, String),
  ];
}

export type RecordedFaults =
  | { status: 'read'; readAt: number; faults: FaultDescription[] }
  | { status: 'failed'; readAt: number; message: string };

/** The fault codes that were set when recording started. */
export function recordedFaults(identity: EcuIdentity): RecordedFaults {
  const { faultCodes } = identity;

  return faultCodes.status === 'read'
    ? {
        status: 'read',
        readAt: faultCodes.readAt,
        faults: activeFaults(faultCodes.value),
      }
    : faultCodes;
}
