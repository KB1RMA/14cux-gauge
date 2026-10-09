// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { buildSyntheticRom } from '../demo/syntheticRom';
import { WRITE_HOLDER } from '../ecuWrite/writes';
import { useReadings } from '../readings/useReadings';
import { ROM_READ_HOLDER } from '../roms/romImage';
import { sessionOver } from '../test-support/ecuSession';
import { EcuProvider } from './EcuProvider';
import type { EcuRead } from './reads';
import type { EcuSession } from './session';
import { useEcu } from './useEcu';
import { useEcuRead } from './useEcuRead';

/** A transport on the demo ROM, whose tune number reads 1234. */
function onDemoRom(): SimulatedTransport {
  const transport = new SimulatedTransport();

  transport.loadRom(buildSyntheticRom());

  return transport;
}

/**
 * Reads the tune number, each call waiting until `release` is called with
 * its turn (0 for the first call).
 */
function heldRead(): { read: EcuRead<number>; release(call: number): void } {
  const gates: (() => void)[] = [];
  const waits: Promise<void>[] = [];

  const gate = (call: number) => {
    while (waits.length <= call) {
      waits.push(
        new Promise<void>((resolve) => {
          gates.push(resolve);
        }),
      );
    }

    return waits[call];
  };

  let calls = 0;

  return {
    read: async (ecu) => {
      await gate(calls++);

      return (await ecu.getTuneRevision()).tuneNumber;
    },
    release: (call) => {
      void gate(call);
      gates[call]?.();
    },
  };
}

const tuneNumber: EcuRead<number> = async (ecu) =>
  (await ecu.getTuneRevision()).tuneNumber;

function renderRead<T>(
  session: EcuSession,
  read: EcuRead<T>,
  options: { onConnect?: boolean } = {},
) {
  return renderHook(() => useEcuRead(read, options), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <EcuProvider session={session}>{children}</EcuProvider>
    ),
  });
}

describe('useEcuRead', () => {
  it('reads on each connection, and drops a result from one that has ended', async () => {
    const { session } = sessionOver([onDemoRom(), onDemoRom()]);
    const held = heldRead();
    const { result } = renderRead(session, held.read, { onConnect: true });

    await act(() => session.connect({ kind: 'demo' }));
    await act(() => session.connect({ kind: 'demo' }));

    // The current connection's read finishes first. The old one's then
    // fails on its closed link, and must not replace it.
    held.release(1);
    await waitFor(() => {
      expect(result.current.value).toBe(1234);
    });
    await act(async () => {
      held.release(0);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.value).toBe(1234);

    await act(() => session.disconnect());

    expect(result.current.value).toBeUndefined();
  });

  it('drops a result read just before the connection ended', async () => {
    const { session } = sessionOver([onDemoRom()]);
    const held = heldRead();
    const { result } = renderRead(session, held.read);

    await act(() => session.connect({ kind: 'demo' }));

    let reading: Promise<void> | undefined;

    act(() => {
      reading = result.current.read();
    });

    expect(result.current.reading).toBe(true);

    // The connection ends before the ECU's answer is taken in.
    const disconnecting = session.disconnect();

    held.release(0);
    await act(async () => {
      await Promise.all([reading, disconnecting]);
    });

    expect(result.current).toMatchObject({
      value: undefined,
      error: undefined,
      reading: false,
    });
  });

  it('keeps the last value when a later read fails, until the error is cleared', async () => {
    const transport = onDemoRom();
    const { session } = sessionOver([transport]);
    const { result } = renderRead(session, tuneNumber);

    await act(() => session.connect({ kind: 'demo' }));
    await act(() => result.current.read());

    expect(result.current.value).toBe(1234);

    transport.silent = true;
    await act(() => result.current.read());

    expect(result.current).toMatchObject({
      value: 1234,
      error:
        'The ECU stopped responding. Check the cable, that the ignition is on, and that the baud rate matches the ECU firmware.',
    });

    act(() => {
      result.current.clearError();
    });

    expect(result.current).toMatchObject({ value: 1234, error: undefined });
  });

  it('reads nothing while a ROM read has the link, and says why', async () => {
    const { session } = sessionOver([onDemoRom()]);
    const { result } = renderRead(session, tuneNumber);

    await act(() => session.connect({ kind: 'demo' }));
    await act(() => result.current.read());

    const romRead = session.acquire(ROM_READ_HOLDER);

    await act(async () => {
      await romRead?.ready;
    });
    await act(() => result.current.read());

    expect(result.current).toMatchObject({
      value: 1234,
      error:
        'Not read: the ECU is busy reading its ROM image. Try again when it finishes.',
      reading: false,
    });

    act(() => {
      romRead?.release();
    });
    await act(() => result.current.read());

    expect(result.current).toMatchObject({ value: 1234, error: undefined });
  });

  it('reads beside a write, as polling does', async () => {
    const { session } = sessionOver([onDemoRom()]);
    const { result } = renderRead(session, tuneNumber);

    await act(() => session.connect({ kind: 'demo' }));
    session.acquire(WRITE_HOLDER);
    await act(() => result.current.read());

    expect(result.current).toMatchObject({ value: 1234, error: undefined });
  });

  it('reads nothing while not connected', async () => {
    const { session } = sessionOver([onDemoRom()]);
    const { result } = renderRead(session, tuneNumber);

    await act(() => result.current.read());

    expect(result.current).toMatchObject({
      value: undefined,
      error: undefined,
      reading: false,
    });
  });
});

describe('ECU hooks outside their providers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('say which provider they need', () => {
    expect(() => renderHook(() => useEcu())).toThrow(
      'ECU hooks must be used inside <EcuProvider>',
    );
    expect(() => renderHook(() => useReadings())).toThrow(
      'useReadings must be used inside <ReadingsProvider>',
    );
  });
});
