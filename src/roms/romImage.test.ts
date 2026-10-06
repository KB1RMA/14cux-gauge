// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  Ecu,
  ReadCancelledError,
  SimulatedTransport,
} from '@kb1rma/libcomm14cux-ts';
import { readRomImage, romFileName, ROM_SIZE, sha256Hex } from './romImage';

/** A ROM whose every byte differs from its neighbours, so a misplaced block shows. */
function plantedRom(): Uint8Array {
  return Uint8Array.from(
    { length: 0x4000 },
    (_, i) => (i * 7 + (i >> 8)) & 0xff,
  );
}

async function ecuWithRom(rom: Uint8Array) {
  const transport = new SimulatedTransport();

  transport.loadRom(rom);

  const ecu = new Ecu(transport);

  await ecu.connect();

  return ecu;
}

describe('readRomImage', () => {
  it('returns the planted ROM byte for byte, reporting progress', async () => {
    const rom = plantedRom();
    const ecu = await ecuWithRom(rom);
    const steps: number[] = [];

    const image = await readRomImage(ecu, {
      onProgress: (bytesRead, total) => {
        expect(total).toBe(16384);
        steps.push(bytesRead);
      },
      isCancelled: () => false,
    });

    expect(image).toEqual(rom);
    expect(image).toEqual(await ecu.dumpROM());
    expect(steps).toHaveLength(65);
    expect(steps[0]).toBe(0);
    expect(steps[1]).toBe(256);
    expect(steps[64]).toBe(16384);
  });

  it('stops when cancelled, before reading further', async () => {
    const ecu = await ecuWithRom(plantedRom());
    let blocks = 0;

    await expect(
      readRomImage(ecu, {
        onProgress: () => {
          blocks++;
        },
        isCancelled: () => blocks >= 3,
      }),
    ).rejects.toBeInstanceOf(ReadCancelledError);
    expect(blocks).toBe(3);
  });

  it('is the length of a ROM', () => {
    expect(ROM_SIZE).toBe(16384);
  });
});

describe('romFileName', () => {
  it('names the file after the tune number and ident', () => {
    expect(romFileName('serial', 3652, 0x23)).toBe(
      '14cux-tune-R3652-ident-0x0023.bin',
    );
    expect(romFileName('serial', 36, 0xde70)).toBe(
      '14cux-tune-R0036-ident-0xDE70.bin',
    );
  });

  it('says so when the image is synthetic', () => {
    expect(romFileName('demo', 1234, 0xde70)).toBe(
      '14cux-demo-synthetic-tune-R1234-ident-0xDE70.bin',
    );
  });
});

describe('sha256Hex', () => {
  it('hashes bytes', async () => {
    // SHA-256 of the ASCII text "abc".
    expect(await sha256Hex(Uint8Array.from([0x61, 0x62, 0x63]))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('gives nothing where the browser has no crypto.subtle', async () => {
    vi.stubGlobal('crypto', {});

    try {
      expect(await sha256Hex(Uint8Array.from([1]))).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
