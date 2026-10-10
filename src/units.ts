// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Gear } from '@kb1rma/libcomm14cux-ts';

export const TEMPERATURE_UNITS = ['F', 'C'] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

export const SPEED_UNITS = ['mph', 'kmh'] as const;
export type SpeedUnit = (typeof SPEED_UNITS)[number];

export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

export function mphToKmh(mph: number): number {
  return mph * 1.609344;
}

export function temperatureLabel(unit: TemperatureUnit): string {
  return unit === 'C' ? '°C' : '°F';
}

export function speedLabel(unit: SpeedUnit): string {
  return unit === 'kmh' ? 'km/h' : 'mph';
}

/** Formats a signed trim count with an explicit `+` for positive values. */
export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : value.toString();
}

export function formatGear(gear: Gear): string {
  switch (gear) {
    case Gear.NoReading:
      return 'No reading';
    case Gear.ParkOrNeutral:
      return 'P / N';
    case Gear.DriveOrReverse:
      return 'D / R';
    case Gear.ManualGearbox:
      return 'Manual';
  }
}
