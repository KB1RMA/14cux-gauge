// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Gear } from 'comm14cux-ts';

export type TemperatureUnit = 'F' | 'C';
export type SpeedUnit = 'mph' | 'kmh';

export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

export function mphToKmh(mph: number): number {
  return mph * 1.609344;
}

export function formatTemperature(
  fahrenheit: number,
  unit: TemperatureUnit,
): string {
  const value = unit === 'C' ? fahrenheitToCelsius(fahrenheit) : fahrenheit;

  return Math.round(value).toString();
}

export function temperatureLabel(unit: TemperatureUnit): string {
  return unit === 'C' ? '°C' : '°F';
}

export function formatSpeed(mph: number, unit: SpeedUnit): string {
  return Math.round(unit === 'kmh' ? mphToKmh(mph) : mph).toString();
}

export function speedLabel(unit: SpeedUnit): string {
  return unit === 'kmh' ? 'km/h' : 'mph';
}

/** Formats a 0–1 fraction as a percentage. */
export function formatPercent(fraction: number, decimals = 0): string {
  return (fraction * 100).toFixed(decimals);
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
