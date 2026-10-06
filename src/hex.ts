// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/** Formats a number as upper-case hex, `0x`-prefixed and zero-padded. */
export function hex(value: number, digits: number): string {
  return `0x${hexDigits(value, digits)}`;
}

/** Upper-case hex digits without a prefix, zero-padded to `digits`. */
export function hexDigits(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, '0');
}
