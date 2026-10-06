// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// ROM layout taken from libcomm14cux via comm14cux-ts; written for 14cux-gauge, 2026.

// A made-up 16 KiB ROM image for demo mode. It is not a real tune and is not
// derived from any ROM dump: only the handful of locations the library reads
// are filled in, and everything else is zero. The fuel map and RPM table are
// generated from simple formulas.

import {
  DataSize,
  FUEL_MAP_COLUMNS,
  FUEL_MAP_ROW_SCALER_OFFSET,
  FUEL_MAP_ROWS,
  MemoryOffset,
} from '@kb1rma/libcomm14cux-ts';

/** Main-voltage coefficients stored in the ROM (A and B are bytes, C a word). */
export const DEMO_VOLTAGE_FACTORS = { a: 0x64, b: 0xbd, c: 0x6180 } as const;

// Tune revision block at 0xFFE9: BCD tune number, checksum fixer, ident word.
const TUNE_NUMBER_BCD = [0x12, 0x34];
const CHECKSUM_FIXER = 0xa5;
const TUNE_IDENT = 0xde70;

/**
 * Engine speed at the start of each fuel map column, lowest first. Each
 * divides 7,500,000 exactly, so it is stored and decoded without rounding.
 */
export const DEMO_RPM_TABLE: readonly number[] = [
  500, 600, 750, 800, 1000, 1200, 1500, 1875, 2000, 2400, 2500, 3000, 3750,
  4000, 5000, 6000,
];

/** The demo uses fuel map 5, at its Rev C (newer layout) address. */
export const DEMO_FUEL_MAP_ADDRESS = MemoryOffset.NewFuelMap5;
const ADJUSTMENT_FACTOR = 0x5a00;
const ROW_SCALER = 0xb0;

/**
 * One fuel map entry: more fuel for more load (lower rows) and a little more
 * at higher engine speed, saturating at 0xFF.
 */
export function demoFuelMapValue(row: number, column: number): number {
  return Math.min(0xff, 0x1c + row * row * 4 + row * 0x14 + column * 2);
}

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

  const map = romIndex(DEMO_FUEL_MAP_ADDRESS);

  for (let row = 0; row < FUEL_MAP_ROWS; row++) {
    for (let column = 0; column < FUEL_MAP_COLUMNS; column++) {
      rom[map + row * FUEL_MAP_COLUMNS + column] = demoFuelMapValue(
        row,
        column,
      );
    }
  }

  rom[map + DataSize.FuelMap] = ADJUSTMENT_FACTOR >> 8;
  rom[map + DataSize.FuelMap + 1] = ADJUSTMENT_FACTOR & 0xff;
  rom[map + FUEL_MAP_ROW_SCALER_OFFSET] = ROW_SCALER;

  // The RPM table holds a pulse period (7,500,000 / RPM) per column, four
  // bytes apart, with the highest-speed column first.
  DEMO_RPM_TABLE.forEach((rpm, column) => {
    const period = 7_500_000 / rpm;
    const at =
      romIndex(MemoryOffset.RPMTable) + (FUEL_MAP_COLUMNS - 1 - column) * 4;

    rom[at] = period >> 8;
    rom[at + 1] = period & 0xff;
  });

  rom.set(
    [...TUNE_NUMBER_BCD, CHECKSUM_FIXER, TUNE_IDENT >> 8, TUNE_IDENT & 0xff],
    romIndex(MemoryOffset.TuneRevision),
  );

  return rom;
}
