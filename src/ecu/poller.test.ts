// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  Ecu,
  Gear,
  MemoryOffset,
  SimulatedTransport,
  TimeoutError,
} from '@kb1rma/libcomm14cux-ts';
import type { LiveSnapshot, ReadingKey } from '../model/snapshot';
import { startPoller, type PollerStats } from './poller';

function plantWord(memory: Uint8Array, address: number, value: number): void {
  memory[address] = value >> 8;
  memory[address + 1] = value & 0xff;
}

/** A simulated ECU with known raw values planted in its memory. */
async function plantedEcu() {
  const transport = new SimulatedTransport();
  const m = transport.memory;

  plantWord(m, MemoryOffset.EngineSpeedFiltered, 10_000); // 750 rpm
  m[MemoryOffset.RoadSpeed] = 100; // km/h → 62 mph
  m[MemoryOffset.CoolantTemp] = 34; // 190 °F
  m[MemoryOffset.FuelTemp] = 110; // 96 °F
  plantWord(m, MemoryOffset.ThrottlePosition, 512);
  plantWord(m, MemoryOffset.ThrottleMinimumPosition, 0);
  plantWord(m, MemoryOffset.MassAirflowLinear, 1729); // 10 %
  plantWord(m, MemoryOffset.ShortTermLambdaFuelingTrimOdd, 0x8500); // +10
  plantWord(m, MemoryOffset.ShortTermLambdaFuelingTrimEven, 0x7b00); // -10
  plantWord(m, MemoryOffset.LongTermLambdaFuelingTrimOdd, 0x8200); // +4
  plantWord(m, MemoryOffset.LongTermLambdaFuelingTrimEven, 0x7e00); // -4
  m[MemoryOffset.IdleBypassPosition] = 90; // half open
  m[MemoryOffset.TransmissionGear] = 0x20; // park/neutral
  m[MemoryOffset.Port1] = 0xbe; // pump running (bit 6 low), MIL lit (bit 0 low)
  plantWord(m, MemoryOffset.InjectorPulseWidth, 2350); // µs
  m[MemoryOffset.FuelMapRowIndex] = 0x28; // row 2, 8/16 towards row 3
  m[MemoryOffset.FuelMapColumnIndex] = 0x74; // column 7, 4/16 towards 8
  m[MemoryOffset.IdleMode] = 0x01;
  plantWord(m, MemoryOffset.TargetIdleSpeed, 740);
  // The ROM is left blank, so the main-voltage coefficients read as zero and
  // that one reading is invalid.

  const ecu = new Ecu(transport);

  await ecu.connect();

  return { transport, ecu };
}

function collect() {
  const snapshots: LiveSnapshot[] = [];
  const stats: PollerStats[] = [];
  const errors: unknown[] = [];
  const retries: number[] = [];

  return {
    snapshots,
    stats,
    errors,
    retries,
    onRetry: (_error: unknown, consecutiveErrors: number) => {
      retries.push(consecutiveErrors);
    },
    onSnapshot: (snapshot: LiveSnapshot, s: PollerStats) => {
      snapshots.push(snapshot);
      stats.push(s);
    },
    onError: (error: unknown) => {
      errors.push(error);
    },
  };
}

describe('startPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a snapshot from the values in ECU memory', async () => {
    const { ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 100, ...sink });

    await vi.advanceTimersByTimeAsync(0);
    poller.stop();

    expect(sink.snapshots).toHaveLength(1);
    expect(sink.snapshots[0]).toMatchObject({
      engineRpm: 750,
      roadSpeedMph: 62,
      coolantTempF: 190,
      fuelTempF: 96,
      airflow: 0.1,
      lambdaShortOdd: 10,
      lambdaShortEven: -10,
      lambdaLongOdd: 4,
      lambdaLongEven: -4,
      idleBypass: 0.5,
      gear: Gear.ParkOrNeutral,
      milOn: true,
      fuelPumpOn: true,
      injectorPulseUs: 2350,
      fuelMapRow: 2.5,
      fuelMapColumn: 7.25,
      idleMode: true,
      targetIdleRpm: 740,
    });
    expect(sink.snapshots[0]?.throttle).toBeCloseTo(0.5005, 4);
    expect(sink.errors).toEqual([]);
  });

  it('blanks a fuel map position the ECU reports out of range', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();

    transport.memory[MemoryOffset.FuelMapRowIndex] = 0x80; // row 8 of 0–7

    const poller = startPoller(ecu, { ...sink });

    await vi.advanceTimersByTimeAsync(0);
    poller.stop();

    expect(sink.snapshots[0]?.fuelMapRow).toBeNull();
    expect(sink.snapshots[0]?.fuelMapColumn).toBe(7.25);
  });

  it('blanks only the reading that is out of range', async () => {
    const { ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { ...sink });

    await vi.advanceTimersByTimeAsync(0);
    poller.stop();

    expect(sink.snapshots[0]?.mainVoltage).toBeNull();
    expect(sink.snapshots[0]?.engineRpm).toBe(750);
    expect(poller.running).toBe(false);
  });

  it('takes no passes while paused, and carries on when resumed', async () => {
    const { ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 100, ...sink });

    await vi.advanceTimersByTimeAsync(0);
    expect(sink.snapshots).toHaveLength(1);

    await poller.pause();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sink.snapshots).toHaveLength(1);
    expect(poller.running).toBe(true);

    poller.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(sink.snapshots).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(100);
    expect(sink.snapshots).toHaveLength(3);
    poller.stop();
  });

  it('reads the slow values afresh on the first pass after a pause', async () => {
    const { ecu, transport } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 100, ...sink });

    await vi.advanceTimersByTimeAsync(0);
    expect(sink.snapshots[0]?.coolantTempF).toBe(190);

    await poller.pause();
    transport.memory[MemoryOffset.CoolantTemp] = 42; // 176 °F
    poller.resume();
    await vi.advanceTimersByTimeAsync(0);

    // Not due: without a pause the next pass would repeat the old 190.
    expect(sink.snapshots[1]?.coolantTempF).toBe(176);
    poller.stop();
  });

  it('settles a pause once the pass in progress has finished', async () => {
    const { ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 100, ...sink });
    let settled = false;

    // The first pass is still reading.
    const paused = poller.pause().then(() => {
      settled = true;
    });

    expect(settled).toBe(false);
    await paused;
    expect(sink.snapshots).toHaveLength(1);
    poller.stop();
  });

  it('settles a pause when polling is stopped', async () => {
    const { ecu } = await plantedEcu();
    const poller = startPoller(ecu, { intervalMs: 100, ...collect() });
    const paused = poller.pause();

    poller.stop();
    await expect(paused).resolves.toBeUndefined();
  });

  it('reads slow-changing values only every Nth pass', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 100, slowEvery: 3, ...sink });

    await vi.advanceTimersByTimeAsync(0);
    transport.memory[MemoryOffset.CoolantTemp] = 0; // 266 °F
    plantWord(transport.memory, MemoryOffset.EngineSpeedFiltered, 5000); // 1500 rpm
    await vi.advanceTimersByTimeAsync(200);
    poller.stop();

    expect(sink.snapshots.map((s) => s.engineRpm)).toEqual([750, 1500, 1500]);
    expect(sink.snapshots.map((s) => s.coolantTempF)).toEqual([190, 190, 190]);

    const resumed = startPoller(ecu, {
      intervalMs: 100,
      slowEvery: 3,
      ...sink,
    });

    await vi.advanceTimersByTimeAsync(0);
    resumed.stop();

    expect(sink.snapshots[3]?.coolantTempF).toBe(266);
  });

  it('reads only the readings asked for, and applies a change on the next pass', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    let wanted: ReadonlySet<ReadingKey> = new Set(['engineRpm', 'milOn']);
    const poller = startPoller(ecu, {
      intervalMs: 100,
      readings: () => wanted,
      ...sink,
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(sink.snapshots[0]).toEqual({
      timestamp: expect.any(Number) as number,
      engineRpm: 750,
      milOn: true,
    });

    const sent = transport.written.length;

    wanted = new Set(['roadSpeedMph']);
    await vi.advanceTimersByTimeAsync(100);
    poller.stop();

    expect(sink.snapshots[1]).toEqual({
      timestamp: expect.any(Number) as number,
      roadSpeedMph: 62,
    });
    // One reading costs less link traffic than two.
    expect(transport.written.length - sent).toBeLessThan(sent);
  });

  it('reads a slow value on every pass when nothing faster is wanted', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, {
      intervalMs: 100,
      slowEvery: 3,
      readings: () => new Set(['coolantTempF']),
      ...sink,
    });

    await vi.advanceTimersByTimeAsync(0);
    transport.memory[MemoryOffset.CoolantTemp] = 0; // 266 °F
    await vi.advanceTimersByTimeAsync(100);
    poller.stop();

    expect(sink.snapshots.map((s) => s.coolantTempF)).toEqual([190, 266]);
  });

  it('reads a watched slow value on every pass despite faster background readings', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, {
      intervalMs: 100,
      slowEvery: 3,
      // The MIL is always read, but the user is watching only coolant.
      readings: () => new Set(['milOn', 'coolantTempF']),
      watched: () => new Set(['coolantTempF']),
      ...sink,
    });

    await vi.advanceTimersByTimeAsync(0);
    transport.memory[MemoryOffset.CoolantTemp] = 0; // 266 °F
    await vi.advanceTimersByTimeAsync(100);
    poller.stop();

    expect(sink.snapshots.map((s) => s.coolantTempF)).toEqual([190, 266]);
  });

  it('keeps slow values for every Nth pass when a fast one is watched', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, {
      intervalMs: 100,
      slowEvery: 3,
      readings: () => new Set(['engineRpm', 'coolantTempF']),
      watched: () => new Set(['engineRpm', 'coolantTempF']),
      ...sink,
    });

    await vi.advanceTimersByTimeAsync(0);
    transport.memory[MemoryOffset.CoolantTemp] = 0; // 266 °F
    await vi.advanceTimersByTimeAsync(300);
    poller.stop();

    expect(sink.snapshots.map((s) => s.coolantTempF)).toEqual([
      190, 190, 190, 266,
    ]);
  });

  it('reads a slow value straight away when it is newly asked for', async () => {
    const { ecu } = await plantedEcu();
    const sink = collect();
    let wanted: ReadonlySet<ReadingKey> = new Set(['engineRpm']);
    const poller = startPoller(ecu, {
      intervalMs: 100,
      slowEvery: 10,
      readings: () => wanted,
      ...sink,
    });

    await vi.advanceTimersByTimeAsync(0);
    wanted = new Set(['engineRpm', 'fuelTempF']);
    await vi.advanceTimersByTimeAsync(100);
    poller.stop();

    expect(sink.snapshots.map((s) => s.fuelTempF)).toEqual([undefined, 96]);
  });

  it('reports the measured sample rate', async () => {
    const { ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 250, ...sink });

    await vi.advanceTimersByTimeAsync(1000);
    poller.stop();

    expect(sink.stats[0]?.sampleRateHz).toBe(0);
    expect(sink.stats.at(-1)?.sampleRateHz).toBe(4);
  });

  it('measures the rate afresh when the readings change', async () => {
    const { ecu } = await plantedEcu();
    const sink = collect();
    let wanted: ReadonlySet<ReadingKey> = new Set(['engineRpm', 'milOn']);
    const poller = startPoller(ecu, {
      intervalMs: 250,
      readings: () => wanted,
      ...sink,
    });

    await vi.advanceTimersByTimeAsync(1000);

    const before = sink.stats.length;

    expect(sink.stats.at(-1)?.sampleRateHz).toBe(4);

    // The first pass of the new readings has no rate of its own yet, rather
    // than the rate of the readings before.
    wanted = new Set(['roadSpeedMph']);
    await vi.advanceTimersByTimeAsync(2000);
    poller.stop();

    expect(sink.stats.slice(before, before + 2)).toEqual([
      { sampleRateHz: 0 },
      { sampleRateHz: 4 },
    ]);
  });

  it('measures the rate afresh after a pause, rather than count it', async () => {
    const { ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 250, ...sink });

    await vi.advanceTimersByTimeAsync(1000);
    await poller.pause();
    await vi.advanceTimersByTimeAsync(5000);

    const before = sink.stats.length;

    poller.resume();
    await vi.advanceTimersByTimeAsync(250);
    poller.stop();

    expect(sink.stats.slice(before)).toEqual([
      { sampleRateHz: 0 },
      { sampleRateHz: 4 },
    ]);
  });

  it('stops reading from the ECU once stopped', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 100, ...sink });

    await vi.advanceTimersByTimeAsync(250);
    poller.stop();

    const written = transport.written.length;
    const count = sink.snapshots.length;

    await vi.advanceTimersByTimeAsync(1000);

    expect(count).toBe(3);
    expect(sink.snapshots).toHaveLength(count);
    expect(transport.written).toHaveLength(written);
    expect(poller.running).toBe(false);
    expect(sink.errors).toEqual([]);
  });

  it('abandons a pass in progress when stopped', async () => {
    const { ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { ...sink });

    poller.stop(); // before the first pass has had a chance to finish
    await vi.advanceTimersByTimeAsync(100);

    expect(sink.snapshots).toEqual([]);
    expect(sink.errors).toEqual([]);
  });

  it('discards a pass whose last read finishes after it was stopped', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    const sent = transport.written.length;
    const poller = startPoller(ecu, {
      readings: () => new Set(['engineRpm']),
      ...sink,
    });

    poller.stop(); // while the pass's only read is under way
    await vi.advanceTimersByTimeAsync(100);

    expect(transport.written.length).toBeGreaterThan(sent);
    expect(sink.snapshots).toEqual([]);
    expect(sink.errors).toEqual([]);
  });

  it('gives up after three consecutive failed passes when the ECU goes silent', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 100, ...sink });

    await vi.advanceTimersByTimeAsync(0);
    transport.silent = true;
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(poller.running).toBe(true);
    expect(sink.errors).toEqual([]);
    expect(sink.retries).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(100);

    expect(poller.running).toBe(false);
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0]).toBeInstanceOf(TimeoutError);
    expect(sink.retries).toEqual([1, 2]);
    expect(sink.snapshots).toHaveLength(1);
  });

  it('recovers when a failed pass is followed by a good one', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 100, ...sink });

    for (let i = 0; i < 4; i++) {
      transport.silent = i % 2 === 1;
      await vi.advanceTimersByTimeAsync(i === 0 ? 0 : 100);
      transport.silent = false;
      await vi.advanceTimersByTimeAsync(100);
    }

    poller.stop();

    expect(sink.errors).toEqual([]);
    expect(sink.snapshots.length).toBeGreaterThan(3);
  });

  it('stops at once on an error that is not a link fault', async () => {
    const { transport, ecu } = await plantedEcu();
    const sink = collect();
    const poller = startPoller(ecu, { intervalMs: 100, ...sink });

    await vi.advanceTimersByTimeAsync(0);
    transport.failWrites = true;
    await vi.advanceTimersByTimeAsync(100);

    expect(poller.running).toBe(false);
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0]).toBeInstanceOf(Error);
    expect(sink.errors[0]).not.toBeInstanceOf(TimeoutError);
  });
});
