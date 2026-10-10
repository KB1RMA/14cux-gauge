// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import type { EcuSession } from '../ecu/session';
import { ROM_READ_HOLDER } from '../roms/romImage';
import { firstSnapshot, sessionOver } from '../test-support/ecuSession';
import { EcuWrites } from './ecuWrites';

/** A transport whose ECU has two fault codes stored. */
function withFaults(): SimulatedTransport {
  const transport = new SimulatedTransport();

  transport.memory[MemoryOffset.FaultCodes] = 0x02;
  transport.memory[MemoryOffset.FaultCodes + 1] = 0x80;

  return transport;
}

/** The controller on `session`, read as a view would read it. */
function writesOn(session: EcuSession) {
  const writes = new EcuWrites(session);

  return {
    writes,
    get state() {
      return writes.getSnapshot();
    },
  };
}

/** Connects `session` again, as a new or lost connection does. */
async function connect(session: EcuSession) {
  await session.connect({ kind: 'demo' });
  await firstSnapshot(session);
}

describe('EcuWrites', () => {
  it('starts nothing without a connection', async () => {
    const transport = withFaults();
    const { session } = sessionOver([transport]);
    const target = writesOn(session);

    expect(target.writes.begin('fuelPump')).toBeUndefined();

    let ran = true;

    ran = await target.writes.run({ id: 'clearFaultCodes' });

    expect(ran).toBe(false);
    expect(target.state.running).toBeUndefined();
    expect(target.state.outcomes).toEqual({});
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0x02);
  });

  it('refuses a second write until the first finishes', async () => {
    const transport = withFaults();
    const { session } = sessionOver([transport]);
    const target = writesOn(session);
    let first: ReturnType<EcuWrites['begin']>;

    await connect(session);
    first = target.writes.begin('fuelPump');

    expect(target.state.running).toBe('fuelPump');
    expect(target.writes.begin('idleAirControl')).toBeUndefined();

    let ran = true;

    ran = await target.writes.run({ id: 'clearFaultCodes' });

    expect(ran).toBe(false);
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0x02);

    first?.finish({ status: 'done', message: 'Fuel pump stopped.' });
    // A second finish changes nothing.
    first?.finish({ status: 'failed', message: 'Too late.' });

    expect(target.state.running).toBeUndefined();
    expect(target.state.outcomes).toEqual({
      fuelPump: { status: 'done', message: 'Fuel pump stopped.' },
    });

    ran = await target.writes.run({ id: 'clearFaultCodes' });

    expect(ran).toBe(true);
    expect(target.state.latest).toBe('clearFaultCodes');
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0);
  });

  it('starts nothing while a ROM read holds the link', async () => {
    const transport = withFaults();
    const { session } = sessionOver([transport]);
    const target = writesOn(session);

    await connect(session);

    const romRead = session.acquire(ROM_READ_HOLDER);

    await romRead?.ready;

    expect(target.writes.begin('fuelPump')).toBeUndefined();

    let ran = true;

    ran = await target.writes.run({ id: 'clearFaultCodes' });

    expect(ran).toBe(false);
    expect(target.state.outcomes).toEqual({});
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0x02);

    romRead?.release();
    ran = await target.writes.run({ id: 'clearFaultCodes' });

    expect(ran).toBe(true);
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0);
  });

  it('lets a write on an old connection neither block nor report on a new one', async () => {
    const { session } = sessionOver([
      new SimulatedTransport(),
      new SimulatedTransport(),
    ]);
    const target = writesOn(session);
    let stale: ReturnType<EcuWrites['begin']>;

    await connect(session);
    stale = target.writes.begin('idleAirControl');
    await connect(session);

    expect(target.state.running).toBeUndefined();

    let fresh: ReturnType<EcuWrites['begin']>;

    fresh = target.writes.begin('fuelPump');

    expect(fresh?.link).toBe(session.getSnapshot().link);
    expect(fresh?.link).not.toBe(stale?.link);

    stale?.finish({ status: 'done', message: 'Commanded 10 steps open.' });

    // The old write ending neither released nor reported on the new one.
    expect(target.state.running).toBe('fuelPump');
    expect(target.state.outcomes).toEqual({
      fuelPump: { status: 'running' },
    });
    expect(target.writes.begin('clearFaultCodes')).toBeUndefined();
  });

  it('tells watchers of each start and end, starting with the write running now', async () => {
    const { session } = sessionOver([
      new SimulatedTransport(),
      new SimulatedTransport(),
    ]);
    const target = writesOn(session);
    let pump: ReturnType<EcuWrites['begin']>;

    await connect(session);
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    pump = target.writes.begin('fuelPump');

    const seen = vi.fn();
    const stop = target.writes.watch(seen);

    expect(seen).toHaveBeenLastCalledWith({
      id: expect.any(String) as string,
      write: 'fuelPump',
      startedAt: 1000,
      endedAt: null,
      outcome: { status: 'running' },
    });

    vi.spyOn(Date, 'now').mockReturnValue(3100);
    pump?.finish({ status: 'done', message: 'Fuel pump stopped.' });

    expect(seen).toHaveBeenLastCalledWith({
      id: (seen.mock.calls[0]?.[0] as { id: string }).id,
      write: 'fuelPump',
      startedAt: 1000,
      endedAt: 3100,
      outcome: { status: 'done', message: 'Fuel pump stopped.' },
    });

    stop();
    target.writes.begin('idleAirControl');

    expect(seen).toHaveBeenCalledTimes(2);

    // A write still running on an old connection is not offered to a new
    // watcher.
    vi.mocked(Date.now).mockRestore();
    await connect(session);

    const later = vi.fn();

    target.writes.watch(later);

    expect(later).not.toHaveBeenCalled();
  });
});
