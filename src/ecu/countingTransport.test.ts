// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { CountingTransport } from './countingTransport';

describe('CountingTransport', () => {
  it('counts the bytes that come back, and only those', async () => {
    const inner = new SimulatedTransport();
    const counted = new CountingTransport(inner);

    await counted.open();
    await counted.write(Uint8Array.of(0x04));

    expect(counted.received).toBe(0);
    expect(await counted.read(1, 10)).toEqual(Uint8Array.of(0x04));
    expect(counted.received).toBe(1);
  });

  it('counts nothing from a silent line', async () => {
    const inner = new SimulatedTransport();
    const counted = new CountingTransport(inner);

    inner.silent = true;
    await counted.open();
    await counted.write(Uint8Array.of(0x04));

    await expect(counted.read(1, 10)).rejects.toThrow();
    expect(counted.received).toBe(0);
  });
});
