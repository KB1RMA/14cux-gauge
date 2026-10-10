// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import type { FilePlatform } from '../platform/platform';
import { MemoryRomStore } from '../storage/romStore';
import { MemorySessionStore } from '../storage/sessionStore';
import { connectedSession } from '../test-support/ecuSession';
import { testPlatform } from '../test-support/platform';
import { controllersOn } from '../test-support/services';
import { storageWith } from '../test-support/storage';

/**
 * A ROM whose every byte differs from its neighbours, with the tune revision
 * block (at 0xFFE9, which is 0x3FE9 into the image) holding tune R3652,
 * ident 0x0023: BCD number 0x36 0x52, checksum fixer, ident 0x00 0x23.
 */
function plantedRom(): Uint8Array {
  const rom = Uint8Array.from(
    { length: 0x4000 },
    (_, i) => (i * 7 + (i >> 8)) & 0xff,
  );

  rom.set([0x36, 0x52, 0x00, 0x00, 0x23], 0x3fe9);

  return rom;
}

async function readerOn(transport = new SimulatedTransport()) {
  const roms = new MemoryRomStore();
  const sessions = new MemorySessionStore();
  const save = vi.fn<FilePlatform['save']>(() => Promise.resolve('saved'));
  const { session } = await connectedSession(transport);
  const services = await controllersOn(
    session,
    testPlatform({
      files: { save },
      storage: { open: storageWith({ roms, sessions }) },
    }),
  );

  return { ...services, romStore: roms, sessions, save, transport };
}

describe('RomReader', () => {
  it('reads the image, keeps a copy and saves it as a file', async () => {
    const transport = new SimulatedTransport();
    const rom = plantedRom();

    transport.loadRom(rom);

    const { roms: reader, save } = await readerOn(transport);
    const progress: number[] = [];

    reader.subscribe(() => {
      const bytesRead = reader.getSnapshot().progress?.bytesRead;

      if (bytesRead !== undefined) {
        progress.push(bytesRead);
      }
    });
    await reader.read();

    const { outcome, images } = reader.getSnapshot();

    expect(outcome).toMatchObject({
      kind: 'read',
      fileName: '14cux-demo-synthetic-tune-R3652-ident-0x0023.bin',
      kept: true,
      notSaved: undefined,
      image: { size: 16384, tuneNumber: 3652, tuneIdent: 0x23 },
    });
    expect(images).toHaveLength(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]).toEqual(rom);
    expect(reader.getSnapshot().progress).toBeUndefined();
    expect(progress.at(0)).toBe(0);
    expect(progress.at(-1)).toBe(16384);
  });

  it('pauses polling while it reads, and carries on after', async () => {
    const { roms: reader, session } = await readerOn();
    const paused: boolean[] = [];

    session.subscribe(() => {
      paused.push(session.getSnapshot().pollingPaused);
    });
    await reader.read();

    expect(paused).toContain(true);
    expect(session.getSnapshot()).toMatchObject({
      pollingPaused: false,
      holder: undefined,
    });
  });

  it('ends a recording before it takes the link', async () => {
    const { roms: reader, recorder, sessions } = await readerOn();

    await recorder.start();
    await reader.read();

    expect(recorder.getSnapshot()).toMatchObject({
      active: undefined,
      finished: undefined,
    });
    expect(await sessions.list()).toHaveLength(1);
  });

  it('stops when cancelled, saving nothing', async () => {
    const { roms: reader, save, romStore } = await readerOn();
    const reading = reader.read();

    await vi.waitFor(() => {
      expect(reader.getSnapshot().progress).toBeDefined();
    });
    reader.cancel();
    expect(reader.getSnapshot().progress?.cancelling).toBe(true);
    await reading;

    expect(reader.getSnapshot().outcome).toEqual({ kind: 'cancelled' });
    expect(save).not.toHaveBeenCalled();
    expect(await romStore.list()).toEqual([]);
  });

  it('reads nothing, and says why, when a write has the link first', async () => {
    const transport = new SimulatedTransport();

    transport.memory[MemoryOffset.FaultCodes] = 0x02;

    const { roms: reader, writes, session } = await readerOn(transport);
    const pump = writes.beginFuelPump();

    await reader.read();

    expect(reader.getSnapshot().outcome).toEqual({
      kind: 'failed',
      message:
        'The ROM image was not read: a write to the ECU started first. Try again when it finishes.',
    });
    expect(session.getSnapshot().pollingPaused).toBe(false);

    pump?.finish({ status: 'done', message: 'Fuel pump stopped.' });
  });

  it('starts no write while a read has the link', async () => {
    const transport = new SimulatedTransport();

    transport.memory[MemoryOffset.FaultCodes] = 0x02;

    const { roms: reader, writes } = await readerOn(transport);
    const reading = reader.read();

    await vi.waitFor(() => {
      expect(reader.getSnapshot().progress).toBeDefined();
    });

    expect(await writes.run({ id: 'clearFaultCodes' })).toBe(false);
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0x02);
    expect(writes.getSnapshot().outcomes).toEqual({});

    await reading;

    expect(await writes.run({ id: 'clearFaultCodes' })).toBe(true);
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0);
  });

  it('saves a kept image again, and deletes it', async () => {
    const { roms: reader, save } = await readerOn();

    await reader.read();
    save.mockClear();

    const [image] = reader.getSnapshot().images ?? [];

    if (!image) {
      throw new Error('No image was kept');
    }

    await reader.download(image);

    expect(save).toHaveBeenCalledTimes(1);

    await reader.remove(image.id);

    expect(reader.getSnapshot().images).toEqual([]);
  });

  it('says when a kept image cannot be read back', async () => {
    const { roms: reader } = await readerOn();

    await reader.download({
      id: 'missing',
      source: 'serial',
      readAt: 1,
      tuneNumber: 1,
      tuneIdent: 2,
      size: 4,
      sha256: undefined,
    });

    expect(reader.getSnapshot().outcome).toEqual({
      kind: 'failed',
      message: 'The saved image could not be read from the browser.',
    });
  });
});
