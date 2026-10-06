// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { hex, hexDigits } from './hex';

describe('hex', () => {
  it('pads and prefixes', () => {
    expect(hex(0xb0, 2)).toBe('0xB0');
    expect(hex(0x5a, 4)).toBe('0x005A');
  });

  it('formats bare digits', () => {
    expect(hexDigits(0x1c, 2)).toBe('1C');
    expect(hexDigits(7, 2)).toBe('07');
  });
});
