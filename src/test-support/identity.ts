// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { EcuIdentity } from '../model/identity';

/** 14:00:00 UTC on 5 October 2026, when the identity below starts being read. */
export const IDENTITY_READ_AT = Date.UTC(2026, 9, 5, 14, 0, 0);

/**
 * An ECU's identity as a recording keeps it: tune 3360, ident 0x0021,
 * checksum fixer 0x5C, a 5,800 rpm rev limit, fuel map 5 and the ROM checksum
 * and coolant sensor faults set, each read a little after the last.
 */
export const IDENTITY: EcuIdentity = {
  tune: {
    status: 'read',
    readAt: IDENTITY_READ_AT,
    value: { tuneNumber: 3360, tuneIdent: 0x21, checksumFixer: 0x5c },
  },
  rpmLimit: { status: 'read', readAt: IDENTITY_READ_AT + 20, value: 5800 },
  fuelMap: { status: 'read', readAt: IDENTITY_READ_AT + 40, value: 5 },
  faultCodes: {
    status: 'read',
    readAt: IDENTITY_READ_AT + 60,
    value: {
      romChecksumFailure: true,
      lambdaSensorOdd: false,
      coolantTempSensor: true,
    },
  },
};
