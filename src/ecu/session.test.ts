// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { waitFor } from '@testing-library/react';
import { ROM_READ_HOLDER } from '../roms/romImage';
import { WRITE_HOLDER } from '../ecuWrite/writes';
import {
  connectedSession,
  firstSnapshot,
  sessionOver,
} from '../test-support/ecuSession';
import type { EcuSession, LinkHolder } from './session';

/**
 * A transport whose engine speed reads 750 rpm: 7,500,000 / 10,000 µs per
 * revolution. 5,000 µs reads 1500 rpm.
 */
function idling(periodUs = 10_000): SimulatedTransport {
  const transport = new SimulatedTransport();

  transport.memory[MemoryOffset.EngineSpeedFiltered] = periodUs >> 8;
  transport.memory[MemoryOffset.EngineSpeedFiltered + 1] = periodUs & 0xff;

  return transport;
}

/** Every connection status `session` passes through, in order. */
function statuses(session: EcuSession): string[] {
  const seen: string[] = [session.getSnapshot().connection.status];

  session.subscribe(() => {
    const { status } = session.getSnapshot().connection;

    if (seen.at(-1) !== status) {
      seen.push(status);
    }
  });

  return seen;
}

describe('EcuSession', () => {
  it('connects, polls and keeps the samples in its history', async () => {
    const { session } = sessionOver([idling()], 5);
    const seen = statuses(session);

    expect(session.getSnapshot().link).toBeUndefined();

    await session.connect({ kind: 'demo' });

    expect(seen).toEqual(['idle', 'connecting', 'connected']);
    expect(session.getSnapshot().link).toBeDefined();

    await firstSnapshot(session);

    expect(session.getLive().snapshot?.engineRpm).toBe(750);
    await waitFor(() => {
      expect(session.history.window('engineRpm').values.length).toBeGreaterThan(
        1,
      );
    });
    expect(new Set(session.history.window('engineRpm').values)).toEqual(
      new Set([750]),
    );
  });

  it('gives each connection a new link, and clears the history', async () => {
    const { session } = sessionOver([idling(), idling(5_000)]);

    await session.connect({ kind: 'demo' });
    await firstSnapshot(session);

    const first = session.getSnapshot().link;

    await session.connect({ kind: 'demo' });
    await firstSnapshot(session);

    expect(session.getSnapshot().link).not.toBe(first);
    // Only the new connection's one pass.
    expect(session.history.window('engineRpm').values).toEqual([1500]);
  });

  it('ends with no link and no live readings when disconnected', async () => {
    const { session, ecu } = await connectedSession(idling());

    await session.disconnect();

    expect(session.getSnapshot()).toEqual({
      connection: { status: 'idle', afterSession: true },
      link: undefined,
      holder: undefined,
      pollingPaused: false,
    });
    expect(session.getLive().snapshot).toBeUndefined();
    expect(ecu.isConnected()).toBe(false);
  });

  it('reports a connection that stops answering, and drops its link', async () => {
    const transport = idling();
    const { session } = sessionOver([transport], 0);

    transport.silent = true;
    await session.connect({ kind: 'demo' });
    await waitFor(() => {
      expect(session.getSnapshot().connection).toMatchObject({
        status: 'error',
        message:
          'The ECU stopped responding. Check the cable, that the ignition is on, and that the baud rate matches the ECU firmware.',
        reason: 'timeout',
      });
    });
    expect(session.getSnapshot().link).toBeUndefined();
  });

  describe('holding the link', () => {
    it('lets one holder have it at a time', async () => {
      const { session } = await connectedSession(idling());
      const write = session.acquire(WRITE_HOLDER);

      expect(write).toBeDefined();
      expect(session.getSnapshot().holder).toBe(WRITE_HOLDER);
      // A ROM read cannot start while a write runs…
      expect(session.acquire(ROM_READ_HOLDER)).toBeUndefined();
      expect(session.acquire(WRITE_HOLDER)).toBeUndefined();

      write?.release();
      // …and a second release changes nothing.
      write?.release();

      const romRead = session.acquire(ROM_READ_HOLDER);

      expect(romRead).toBeDefined();
      await romRead?.ready;
      // …nor a write while a ROM read runs.
      expect(session.acquire(WRITE_HOLDER)).toBeUndefined();

      romRead?.release();

      expect(session.getSnapshot().holder).toBeUndefined();
      expect(session.acquire(WRITE_HOLDER)).toBeDefined();
    });

    it('is not held while not connected', async () => {
      const { session } = sessionOver([idling()]);

      expect(session.acquire(WRITE_HOLDER)).toBeUndefined();

      await session.connect({ kind: 'demo' });
      await session.disconnect();

      expect(session.acquire(WRITE_HOLDER)).toBeUndefined();
    });

    it('is free on a new connection while the old one’s holder finishes', async () => {
      const { session } = sessionOver([idling(), idling()]);

      await session.connect({ kind: 'demo' });

      const old = session.acquire(ROM_READ_HOLDER);

      await old?.ready;
      await session.connect({ kind: 'demo' });

      expect(session.getSnapshot()).toMatchObject({
        holder: undefined,
        pollingPaused: false,
      });

      const fresh = session.acquire(WRITE_HOLDER);

      expect(fresh).toBeDefined();

      // The old holder letting go neither frees nor resumes the new link.
      old?.release();

      expect(session.getSnapshot().holder).toBe(WRITE_HOLDER);
      expect(session.acquire(ROM_READ_HOLDER)).toBeUndefined();
    });

    it('stops any recording, then pauses polling, for a holder that asks', async () => {
      const { session } = await connectedSession(idling(), 5);
      const order: string[] = [];

      session.setRecordingStopper(() => {
        order.push(
          `recording stopped, polling ${session.getSnapshot().pollingPaused ? 'paused' : 'running'}`,
        );

        return Promise.resolve();
      });

      const lease = session.acquire(ROM_READ_HOLDER);

      await lease?.ready;
      order.push(
        `ready, polling ${session.getSnapshot().pollingPaused ? 'paused' : 'running'}`,
      );

      expect(order).toEqual([
        'recording stopped, polling running',
        'ready, polling paused',
      ]);
      expect(session.getLive().snapshot).toBeUndefined();

      lease?.release();

      expect(session.getSnapshot().pollingPaused).toBe(false);
      await firstSnapshot(session);
    });

    it('leaves polling and recording alone for a holder that does not', async () => {
      const { session } = await connectedSession(idling());
      const stopRecording = vi.fn(() => Promise.resolve());

      session.setRecordingStopper(stopRecording);

      const lease = session.acquire(WRITE_HOLDER);

      await lease?.ready;

      expect(stopRecording).not.toHaveBeenCalled();
      expect(session.getSnapshot().pollingPaused).toBe(false);
      expect(session.getLive().snapshot?.engineRpm).toBe(750);
    });

    it('marks the pause in the history, so graphs break the line there', async () => {
      const { session } = await connectedSession(idling(), 5);

      await waitFor(() => {
        expect(
          session.history.window('engineRpm').values.length,
        ).toBeGreaterThan(2);
      });

      const lease = session.acquire(ROM_READ_HOLDER);

      await lease?.ready;

      const paused = session.history.window('engineRpm').values;

      expect(paused.at(-1)).toBeNull();
      expect(paused.at(-2)).toBe(750);

      lease?.release();
      await waitFor(() => {
        expect(session.history.window('engineRpm').values.at(-1)).toBe(750);
      });

      // The invalid sample is still there, between the readings either side.
      expect(session.history.window('engineRpm').values).toContain(null);
    });

    it('is given back before polling resumes when released early', async () => {
      const { session } = await connectedSession(idling(), 5);
      const pausing: LinkHolder = { ...ROM_READ_HOLDER, stopsRecording: false };
      const lease = session.acquire(pausing);

      // Released before the pause took effect: polling must not stay paused.
      lease?.release();
      await lease?.ready;

      expect(session.getSnapshot()).toMatchObject({
        holder: undefined,
        pollingPaused: false,
      });
      await firstSnapshot(session);
    });
  });

  describe('snapshot listeners', () => {
    it('hears every snapshot with only the chosen readings', async () => {
      const { session } = sessionOver([idling()], 5);
      const heard: string[][] = [];

      session.select({
        polled: new Set(['engineRpm', 'roadSpeedMph']),
        chosen: new Set(['engineRpm']),
        watched: new Set(['engineRpm']),
      });

      const stop = session.onSnapshot((snapshot) => {
        heard.push(Object.keys(snapshot).sort());
      });

      await session.connect({ kind: 'demo' });
      await waitFor(() => {
        expect(heard.length).toBeGreaterThan(1);
      });
      stop();

      expect(heard[0]).toEqual(['engineRpm', 'timestamp']);
      expect(session.getLive().snapshot).toMatchObject({
        engineRpm: 750,
        roadSpeedMph: 0,
      });
    });
  });
});
