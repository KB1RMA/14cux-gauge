// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { EcuProvider } from '../ecu/EcuProvider';
import type { EcuSession } from '../ecu/session';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { ROM_READ_HOLDER } from '../roms/romImage';
import { firstSnapshot, sessionOver } from '../test-support/ecuSession';
import { EcuWriteProvider } from './EcuWriteProvider';
import { useEcuWrite } from './useEcuWrite';

/** A transport whose ECU has two fault codes stored. */
function withFaults(): SimulatedTransport {
  const transport = new SimulatedTransport();

  transport.memory[MemoryOffset.FaultCodes] = 0x02;
  transport.memory[MemoryOffset.FaultCodes + 1] = 0x80;

  return transport;
}

/** The hook inside a provider on `session`. */
function renderWrites(session: EcuSession) {
  return renderHook(() => useEcuWrite(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NotificationsProvider>
        <EcuProvider session={session}>
          <EcuWriteProvider>{children}</EcuWriteProvider>
        </EcuProvider>
      </NotificationsProvider>
    ),
  });
}

/** Connects `session` again, as a new or lost connection does. */
async function connect(session: EcuSession) {
  await act(async () => {
    await session.connect({ kind: 'demo' });
    await firstSnapshot(session);
  });
}

describe('useEcuWrite', () => {
  it('must be used inside its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useEcuWrite())).toThrow(
      'useEcuWrite must be used inside <EcuWriteProvider>',
    );
  });

  it('starts nothing without a connection', async () => {
    const transport = withFaults();
    const { session } = sessionOver([transport]);
    const { result } = renderWrites(session);

    expect(result.current.begin('fuelPump')).toBeUndefined();

    let ran = true;

    await act(async () => {
      ran = await result.current.run({ id: 'clearFaultCodes' });
    });

    expect(ran).toBe(false);
    expect(result.current.running).toBeUndefined();
    expect(result.current.outcomes).toEqual({});
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0x02);
  });

  it('refuses a second write until the first finishes', async () => {
    const transport = withFaults();
    const { session } = sessionOver([transport]);
    const { result } = renderWrites(session);
    let first: ReturnType<typeof result.current.begin>;

    await connect(session);
    act(() => {
      first = result.current.begin('fuelPump');
    });

    expect(result.current.running).toBe('fuelPump');
    expect(result.current.begin('idleAirControl')).toBeUndefined();

    let ran = true;

    await act(async () => {
      ran = await result.current.run({ id: 'clearFaultCodes' });
    });

    expect(ran).toBe(false);
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0x02);

    act(() => {
      first?.finish({ status: 'done', message: 'Fuel pump stopped.' });
      // A second finish changes nothing.
      first?.finish({ status: 'failed', message: 'Too late.' });
    });

    expect(result.current.running).toBeUndefined();
    expect(result.current.outcomes).toEqual({
      fuelPump: { status: 'done', message: 'Fuel pump stopped.' },
    });

    await act(async () => {
      ran = await result.current.run({ id: 'clearFaultCodes' });
    });

    expect(ran).toBe(true);
    expect(result.current.latest).toBe('clearFaultCodes');
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0);
  });

  it('starts nothing while a ROM read holds the link', async () => {
    const transport = withFaults();
    const { session } = sessionOver([transport]);
    const { result } = renderWrites(session);

    await connect(session);

    const romRead = session.acquire(ROM_READ_HOLDER);

    await act(async () => {
      await romRead?.ready;
    });

    expect(result.current.begin('fuelPump')).toBeUndefined();

    let ran = true;

    await act(async () => {
      ran = await result.current.run({ id: 'clearFaultCodes' });
    });

    expect(ran).toBe(false);
    expect(result.current.outcomes).toEqual({});
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0x02);

    act(() => {
      romRead?.release();
    });
    await act(async () => {
      ran = await result.current.run({ id: 'clearFaultCodes' });
    });

    expect(ran).toBe(true);
    expect(transport.memory[MemoryOffset.FaultCodes]).toBe(0);
  });

  it('lets a write on an old connection neither block nor report on a new one', async () => {
    const { session } = sessionOver([
      new SimulatedTransport(),
      new SimulatedTransport(),
    ]);
    const { result } = renderWrites(session);
    let stale: ReturnType<typeof result.current.begin>;

    await connect(session);
    act(() => {
      stale = result.current.begin('idleAirControl');
    });
    await connect(session);

    expect(result.current.running).toBeUndefined();

    let fresh: ReturnType<typeof result.current.begin>;

    act(() => {
      fresh = result.current.begin('fuelPump');
    });

    expect(fresh?.link).toBe(session.getSnapshot().link);
    expect(fresh?.link).not.toBe(stale?.link);

    act(() => {
      stale?.finish({ status: 'done', message: 'Commanded 10 steps open.' });
    });

    // The old write ending neither released nor reported on the new one.
    expect(result.current.running).toBe('fuelPump');
    expect(result.current.outcomes).toEqual({
      fuelPump: { status: 'running' },
    });
    expect(result.current.begin('clearFaultCodes')).toBeUndefined();
  });

  it('tells watchers of each start and end, starting with the write running now', async () => {
    const { session } = sessionOver([
      new SimulatedTransport(),
      new SimulatedTransport(),
    ]);
    const { result } = renderWrites(session);
    let pump: ReturnType<typeof result.current.begin>;

    await connect(session);
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    act(() => {
      pump = result.current.begin('fuelPump');
    });

    const seen = vi.fn();
    const stop = result.current.watch(seen);

    expect(seen).toHaveBeenLastCalledWith({
      id: expect.any(String) as string,
      write: 'fuelPump',
      startedAt: 1000,
      endedAt: null,
      outcome: { status: 'running' },
    });

    vi.spyOn(Date, 'now').mockReturnValue(3100);
    act(() => {
      pump?.finish({ status: 'done', message: 'Fuel pump stopped.' });
    });

    expect(seen).toHaveBeenLastCalledWith({
      id: (seen.mock.calls[0]?.[0] as { id: string }).id,
      write: 'fuelPump',
      startedAt: 1000,
      endedAt: 3100,
      outcome: { status: 'done', message: 'Fuel pump stopped.' },
    });

    stop();
    act(() => {
      result.current.begin('idleAirControl');
    });

    expect(seen).toHaveBeenCalledTimes(2);

    // A write still running on an old connection is not offered to a new
    // watcher.
    vi.mocked(Date.now).mockRestore();
    await connect(session);

    const later = vi.fn();

    result.current.watch(later);

    expect(later).not.toHaveBeenCalled();
  });
});
