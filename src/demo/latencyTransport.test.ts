// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Ecu, MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { LatencyTransport } from './latencyTransport';

describe('LatencyTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays reads but passes the bytes through unchanged', async () => {
    const simulated = new SimulatedTransport();

    simulated.memory[MemoryOffset.RoadSpeed] = 100; // km/h → 62 mph

    const ecu = new Ecu(
      new LatencyTransport(simulated, { perReadMs: 5, perByteMs: 1 }),
    );

    await ecu.connect();

    let speed: number | undefined;

    void ecu.getRoadSpeed().then((value) => {
      speed = value;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(speed).toBeUndefined();

    await vi.advanceTimersByTimeAsync(100);
    expect(speed).toBe(62);
    await ecu.disconnect();
  });
});
