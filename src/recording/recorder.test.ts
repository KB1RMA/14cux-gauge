// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { MemorySessionStore } from '../storage/sessionStore';
import { connectedSession } from '../test-support/ecuSession';
import { testPlatform } from '../test-support/platform';
import { controllersOn } from '../test-support/services';
import { storageWith } from '../test-support/storage';

async function recorderOn(transport = new SimulatedTransport()) {
  const sessions = new MemorySessionStore();
  const { session } = await connectedSession(transport);
  const services = await controllersOn(
    session,
    testPlatform({ storage: { open: storageWith({ sessions }) } }),
  );

  return { ...services, sessions, transport };
}

describe('Recorder', () => {
  it('records a session while asked, and offers it to be named', async () => {
    const { recorder, sessions } = await recorderOn();

    expect(recorder.getSnapshot()).toMatchObject({
      canRecord: true,
      active: undefined,
    });

    await recorder.start();

    const { active } = recorder.getSnapshot();

    expect(active).toMatchObject({ source: 'demo' });

    await recorder.stop();

    expect(recorder.getSnapshot().active).toBeUndefined();
    expect(recorder.getSnapshot().finished?.id).toBe(active?.id);
    expect((await sessions.list()).map(({ id }) => id)).toEqual([active?.id]);

    recorder.dismissFinished();

    expect(recorder.getSnapshot().finished).toBeUndefined();
  });

  it('keeps the writes made while it records', async () => {
    const transport = new SimulatedTransport();

    transport.memory[MemoryOffset.FaultCodes] = 0x02;

    const { recorder, writes, sessions } = await recorderOn(transport);

    await recorder.start();

    const id = recorder.getSnapshot().active?.id ?? '';

    expect(await writes.run({ id: 'clearFaultCodes' })).toBe(true);
    await recorder.stop();

    const kept = await sessions.readWrites(id);

    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      write: 'clearFaultCodes',
      outcome: { status: 'done', message: 'Fault codes cleared.' },
    });
  });

  it('is interrupted without offering a name', async () => {
    const { recorder, sessions } = await recorderOn();

    await recorder.start();
    await recorder.interrupt();

    expect(recorder.getSnapshot()).toMatchObject({
      active: undefined,
      finished: undefined,
    });
    expect(await sessions.list()).toHaveLength(1);
  });

  it('keeps what it has when the connection ends', async () => {
    const { recorder, session, sessions } = await recorderOn();

    await recorder.start();
    await session.disconnect();

    await vi.waitFor(async () => {
      expect(recorder.getSnapshot().active).toBeUndefined();
      expect(await sessions.list()).toHaveLength(1);
    });
    expect(recorder.getSnapshot()).toMatchObject({
      canRecord: false,
      finished: undefined,
    });
  });

  it('starts nothing when not connected', async () => {
    const { recorder, session, sessions } = await recorderOn();

    await session.disconnect();
    await recorder.start();

    expect(recorder.getSnapshot().active).toBeUndefined();
    expect(await sessions.list()).toEqual([]);
  });
});
