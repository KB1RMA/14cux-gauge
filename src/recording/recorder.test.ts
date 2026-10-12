// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  MemoryOffset,
  type Ecu,
  SimulatedTransport,
  TimeoutError,
} from '@kb1rma/libcomm14cux-ts';
import { buildSyntheticRom } from '../demo/syntheticRom';
import { readTuneInfo } from '../ecu/reads';
import type { EcuSession } from '../ecu/session';
import { ROM_READ_HOLDER } from '../roms/romImage';
import { MemoryRomStore } from '../storage/romStore';
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

/** The ECU `session` is connected to. */
function connectedEcu(session: EcuSession): Ecu {
  const { link } = session.getSnapshot();
  const ecu = link && session.ecuFor(link);

  if (!ecu) {
    throw new Error('Not connected');
  }

  return ecu;
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

  it('keeps the ECU’s identity and fault codes from when it started', async () => {
    const transport = new SimulatedTransport();
    const startAt = Date.UTC(2026, 9, 5, 14, 0, 0);

    transport.loadRom(buildSyntheticRom()); // tune 1234, ident 0xDE70, fixer 0xA5
    transport.memory[MemoryOffset.RPMLimit] = 1500 >> 8; // 7,500,000 / 1500 = 5000 rpm
    transport.memory[MemoryOffset.RPMLimit + 1] = 1500 & 0xff;
    transport.memory[MemoryOffset.CurrentFuelMapId] = 3;
    transport.memory[MemoryOffset.FaultCodes] = 0x02; // lambda sensor, odd bank

    const { recorder, sessions } = await recorderOn(transport);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startAt);
    onTestFinished(() => {
      vi.useRealTimers();
    });

    await recorder.start();
    await recorder.stop();

    const [saved] = await sessions.list();
    const identity = saved?.identity;

    expect(saved?.formatVersion).toBe(4);
    expect(identity).toMatchObject({
      tune: {
        status: 'read',
        readAt: startAt,
        value: { tuneNumber: 1234, tuneIdent: 0xde70, checksumFixer: 0xa5 },
      },
      rpmLimit: { status: 'read', readAt: startAt, value: 5000 },
      fuelMap: { status: 'read', readAt: startAt, value: 3 },
      faultCodes: { status: 'read', readAt: startAt },
    });

    const flags =
      identity?.faultCodes.status === 'read' ? identity.faultCodes.value : {};

    expect(Object.keys(flags).filter((name) => flags[name] === true)).toEqual([
      'lambdaSensorOdd',
    ]);
    expect(Object.keys(flags)).toContain('romChecksumFailure');
  });

  it('keeps values the ECU gave as invalid apart from those it read', async () => {
    const transport = new SimulatedTransport();

    transport.memory[MemoryOffset.RPMLimit] = 0; // a zero period
    transport.memory[MemoryOffset.RPMLimit + 1] = 0;
    transport.memory[MemoryOffset.CurrentFuelMapId] = 9; // only 0 to 5 exist

    const { recorder, sessions } = await recorderOn(transport);

    await recorder.start();
    await recorder.stop();

    const identity = (await sessions.list())[0]?.identity;

    expect(identity?.rpmLimit.status).toBe('invalid');
    expect(identity?.fuelMap.status).toBe('invalid');
    expect(identity?.tune.status).toBe('read');
  });

  it('keeps the tune read on the connection, and reads the rest as it starts', async () => {
    const transport = new SimulatedTransport();
    const connectedAt = Date.UTC(2026, 9, 5, 14, 0, 0);
    const startAt = connectedAt + 60_000;

    transport.loadRom(buildSyntheticRom());

    const { recorder, session, sessions } = await recorderOn(transport);
    const getTuneRevision = vi.spyOn(connectedEcu(session), 'getTuneRevision');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(connectedAt);
    onTestFinished(() => {
      vi.useRealTimers();
    });

    // As the ECU info does when the ECU connects.
    await session.readNow(readTuneInfo);
    vi.setSystemTime(startAt);
    await recorder.start();
    await recorder.stop();
    await recorder.start();
    await recorder.stop();

    expect(getTuneRevision).toHaveBeenCalledTimes(1);

    for (const { identity } of await sessions.list()) {
      expect(identity).toMatchObject({
        tune: { status: 'read', readAt: connectedAt },
        rpmLimit: { readAt: startAt },
        fuelMap: { readAt: startAt },
        faultCodes: { readAt: startAt },
      });
    }
  });

  it('keeps the tune the ECU info read last, or the one before if a new read fails', async () => {
    const transport = new SimulatedTransport();
    const first = Date.UTC(2026, 9, 5, 14, 0, 0);
    const second = first + 60_000;

    transport.loadRom(buildSyntheticRom());

    const { recorder, session, sessions } = await recorderOn(transport);
    const getTuneRevision = vi.spyOn(connectedEcu(session), 'getTuneRevision');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(first);
    onTestFinished(() => {
      vi.useRealTimers();
    });

    // Asked for again in the ECU info, it reads the ECU each time.
    await session.readNow(readTuneInfo);
    vi.setSystemTime(second);
    await session.readNow(readTuneInfo);

    expect(getTuneRevision).toHaveBeenCalledTimes(2);

    vi.setSystemTime(second + 60_000);
    getTuneRevision.mockRejectedValueOnce(
      new TimeoutError('The ECU stopped responding.'),
    );
    await expect(session.readNow(readTuneInfo)).rejects.toThrow(TimeoutError);
    await recorder.start();
    await recorder.stop();

    expect((await sessions.list())[0]?.identity?.tune).toEqual({
      status: 'read',
      readAt: second,
      value: { tuneNumber: 1234, tuneIdent: 0xde70, checksumFixer: 0xa5 },
    });
  });

  it('starts once the ECU’s identity is read, keeping writes made meanwhile', async () => {
    const transport = new SimulatedTransport();
    const startAt = Date.UTC(2026, 9, 5, 14, 0, 0);
    const readDone = startAt + 800;

    transport.memory[MemoryOffset.FaultCodes] = 0x02; // lambda sensor, odd bank

    const { recorder, session, sessions, writes } = await recorderOn(transport);
    const ecu = connectedEcu(session);
    const getFaultCodes = ecu.getFaultCodes.bind(ecu);
    let clearing: Promise<boolean> | undefined;

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startAt);
    onTestFinished(() => {
      vi.useRealTimers();
    });
    // The last identity read: the user clears the codes as it finishes.
    vi.spyOn(ecu, 'getFaultCodes').mockImplementationOnce(async () => {
      const codes = await getFaultCodes();

      clearing = writes.run({ id: 'clearFaultCodes' });
      vi.setSystemTime(readDone);

      return codes;
    });

    const starting = recorder.start();

    expect(recorder.getSnapshot().starting).toBe(true);
    await starting;
    expect(recorder.getSnapshot().starting).toBe(false);
    expect(await clearing).toBe(true);
    await recorder.stop();

    const [saved] = await sessions.list();

    expect(saved?.startedAt).toBe(readDone);
    expect(saved?.identity?.rpmLimit.readAt).toBe(startAt);

    const flags =
      saved?.identity?.faultCodes.status === 'read'
        ? saved.identity.faultCodes.value
        : {};

    expect(flags['lambdaSensorOdd']).toBe(true);
    expect(await sessions.readWrites(saved?.id ?? '')).toMatchObject([
      {
        write: 'clearFaultCodes',
        outcome: { status: 'done', message: 'Fault codes cleared.' },
      },
    ]);
  });

  it('reads the tune again when it could not be read before', async () => {
    const { recorder, session, sessions } = await recorderOn();

    vi.spyOn(connectedEcu(session), 'getTuneRevision').mockRejectedValueOnce(
      new TimeoutError('The ECU stopped responding.'),
    );

    await recorder.start();
    await recorder.stop();
    await recorder.start();
    await recorder.stop();

    const tunes = (await sessions.list()).map(({ identity }) => identity?.tune);

    expect(tunes.map((tune) => tune?.status).sort()).toEqual([
      'failed',
      'read',
    ]);
  });

  it('says the identity was not read when a ROM read has the link', async () => {
    const { recorder, session, sessions } = await recorderOn();
    const lease = session.acquire(ROM_READ_HOLDER);

    await lease?.ready;
    await recorder.start();
    lease?.release();
    await recorder.stop();

    const identity = (await sessions.list())[0]?.identity;

    expect(identity?.tune).toMatchObject({
      status: 'failed',
      message: 'The ECU was busy or no longer connected.',
    });
    expect(identity?.faultCodes.status).toBe('failed');
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

  it('stops when asked while it is still starting', async () => {
    const { recorder, sessions } = await recorderOn();
    const starting = recorder.start();

    await recorder.stop();
    await starting;

    expect(recorder.getSnapshot().active).toBeUndefined();
    expect(recorder.getSnapshot().finished).toBeDefined();
    expect(await sessions.list()).toHaveLength(1);
  });

  it('is interrupted when it is still starting', async () => {
    const { recorder, sessions } = await recorderOn();
    const starting = recorder.start();

    await recorder.interrupt();
    await starting;

    expect(recorder.getSnapshot().active).toBeUndefined();
    expect((await sessions.list())[0]?.endedAt).not.toBeNull();
  });

  it('finishes the session before the storage closes with the services', async () => {
    const sessions = new MemorySessionStore();
    const order: string[] = [];
    const finish = sessions.finish.bind(sessions);

    sessions.finish = (id, endedAt) => {
      order.push('finished');

      return finish(id, endedAt);
    };

    const { session } = await connectedSession(new SimulatedTransport());
    const services = await controllersOn(
      session,
      testPlatform({
        storage: {
          open: () =>
            Promise.resolve({
              sessions,
              roms: new MemoryRomStore(),
              persistent: true,
              onClosed: () => () => undefined,
              close: () => {
                order.push('closed');
              },
            }),
        },
      }),
    );

    await services.recorder.start();
    services.dispose();

    await vi.waitFor(() => {
      expect(order).toEqual(['finished', 'closed']);
    });
    expect((await sessions.list())[0]?.endedAt).not.toBeNull();
  });
});
