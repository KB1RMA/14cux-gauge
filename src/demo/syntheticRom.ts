// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// ROM layout taken from libcomm14cux via comm14cux-ts; written for 14cux-gauge, 2026.

// A made-up 16 KiB ROM image for demo mode. It is not a real tune and is not
// derived from any ROM dump: only the handful of locations the library reads
// are filled in, and everything else is zero.

import { DataSize, MemoryOffset } from '@kb1rma/libcomm14cux-ts';

/** Main-voltage coefficients stored in the ROM (A and B are bytes, C a word). */
export const DEMO_VOLTAGE_FACTORS = { a: 0x64, b: 0xbd, c: 0x6180 } as const;

// Tune revision block at 0xFFE9: BCD tune number, checksum fixer, ident word.
const TUNE_NUMBER_BCD = [0x12, 0x34];
const CHECKSUM_FIXER = 0xa5;
const TUNE_IDENT = 0xde70;

function romIndex(address: number): number {
  return address - MemoryOffset.ROMAddress;
}

/** Builds the synthetic ROM, to load with `SimulatedTransport.loadRom`. */
export function buildSyntheticRom(): Uint8Array {
  const rom = new Uint8Array(DataSize.ROM);

  // ROM revision detection reads 16 bytes at the old fuel map 1 address; any
  // byte above 0x30 marks the newer (Rev C) layout.
  for (let i = 0; i < 16; i++) {
    rom[romIndex(MemoryOffset.OldFuelMap1) + i] = 0x40 + i * 4;
  }

  rom[romIndex(MemoryOffset.RevCMainVoltageFactorA)] = DEMO_VOLTAGE_FACTORS.a;
  rom[romIndex(MemoryOffset.RevCMainVoltageFactorB)] = DEMO_VOLTAGE_FACTORS.b;
  rom[romIndex(MemoryOffset.RevCMainVoltageFactorC)] =
    DEMO_VOLTAGE_FACTORS.c >> 8;
  rom[romIndex(MemoryOffset.RevCMainVoltageFactorC) + 1] =
    DEMO_VOLTAGE_FACTORS.c & 0xff;

  rom.set(
    [...TUNE_NUMBER_BCD, CHECKSUM_FIXER, TUNE_IDENT >> 8, TUNE_IDENT & 0xff],
    romIndex(MemoryOffset.TuneRevision),
  );

  return rom;
}
