// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Ecu, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { EcuContext } from '../ecu/contexts';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { ecuContextValue } from '../test-support/ecuContext';
import { EcuWriteProvider } from './EcuWriteProvider';
import { useEcuWrite } from './useEcuWrite';

async function connected() {
  const ecu = new Ecu(new SimulatedTransport());

  await ecu.connect();

  return ecu;
}

/**
 * The hook inside a provider connected to `ecu`; `reconnect` swaps the
 * connection, as a new or lost one does.
 */
function renderWrites(ecu: Ecu | undefined) {
  let current = ecu;
  const rendered = renderHook(() => useEcuWrite(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NotificationsProvider>
        <EcuContext value={ecuContextValue(current)}>
          <EcuWriteProvider>{children}</EcuWriteProvider>
        </EcuContext>
      </NotificationsProvider>
    ),
  });

  return {
    result: rendered.result,
    reconnect(next: Ecu | undefined) {
      current = next;
      rendered.rerender();
    },
  };
}

describe('useEcuWrite', () => {
  it('must be used inside its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useEcuWrite())).toThrow(
      'useEcuWrite must be used inside <EcuWriteProvider>',
    );
  });

  it('starts nothing without a connection', async () => {
    const { result } = renderWrites(undefined);

    expect(result.current.begin('fuelPump')).toBeUndefined();

    let ran = true;

    await act(async () => {
      ran = await result.current.run('clearFaultCodes', () =>
        Promise.resolve('Fault codes cleared.'),
      );
    });

    expect(ran).toBe(false);
    expect(result.current.running).toBeUndefined();
    expect(result.current.outcomes).toEqual({});
  });

  it('refuses a second write until the first finishes', async () => {
    const ecu = await connected();
    const { result } = renderWrites(ecu);
    const task = vi.fn(() => Promise.resolve('Fault codes cleared.'));
    let first: ReturnType<typeof result.current.begin>;

    act(() => {
      first = result.current.begin('fuelPump');
    });

    expect(result.current.running).toBe('fuelPump');
    expect(result.current.begin('idleAirControl')).toBeUndefined();

    let ran = true;

    await act(async () => {
      ran = await result.current.run('clearFaultCodes', task);
    });

    expect(ran).toBe(false);
    expect(task).not.toHaveBeenCalled();

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
      ran = await result.current.run('clearFaultCodes', task);
    });

    expect(ran).toBe(true);
    expect(result.current.latest).toBe('clearFaultCodes');
  });

  it('lets a write on an old connection neither block nor report on a new one', async () => {
    const old = await connected();
    const next = await connected();
    const { result, reconnect } = renderWrites(old);
    let stale: ReturnType<typeof result.current.begin>;

    act(() => {
      stale = result.current.begin('idleAirControl');
    });
    reconnect(next);

    expect(result.current.running).toBeUndefined();

    let fresh: ReturnType<typeof result.current.begin>;

    act(() => {
      fresh = result.current.begin('fuelPump');
    });

    expect(fresh?.ecu).toBe(next);

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
    const old = await connected();
    const next = await connected();
    const { result, reconnect } = renderWrites(old);
    let pump: ReturnType<typeof result.current.begin>;

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
    reconnect(next);

    const later = vi.fn();

    result.current.watch(later);

    expect(later).not.toHaveBeenCalled();
  });
});
