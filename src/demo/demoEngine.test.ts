// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Ecu, Gear, MemoryOffset, ThrottlePosType } from 'comm14cux-ts';
import { createDemoEngine, type DemoEngineOptions } from './demoEngine';

async function connectDemo(options?: DemoEngineOptions) {
  const engine = createDemoEngine(options);
  const ecu = new Ecu(engine.transport);

  await ecu.connect();

  return { engine, ecu };
}

describe('demo engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the synthetic tune revision from its ROM', async () => {
    const { engine, ecu } = await connectDemo();

    await expect(ecu.getTuneRevision()).resolves.toEqual({
      tuneNumber: 1234,
      checksumFixer: 0xa5,
      tuneIdent: 0xde70,
    });
    engine.stop();
  });

  it('decodes a charging-system voltage using the ROM coefficients', async () => {
    const { engine, ecu } = await connectDemo();
    const volts = await ecu.getMainVoltage();

    expect(volts).toBeGreaterThan(13.8);
    expect(volts).toBeLessThan(14.4);
    engine.stop();
  });

  it('starts with a cold engine idling in park', async () => {
    const { engine, ecu } = await connectDemo();

    await expect(ecu.getCoolantTemp()).resolves.toBe(57);
    await expect(ecu.getFuelTemp()).resolves.toBe(66);
    await expect(ecu.getRoadSpeed()).resolves.toBe(0);
    await expect(ecu.getGearSelection()).resolves.toBe(Gear.ParkOrNeutral);
    await expect(ecu.getFuelPumpRelayState()).resolves.toBe(true);
    await expect(ecu.getIdleMode()).resolves.toBe(true);

    const rpm = await ecu.getEngineRPM();

    expect(rpm).toBeGreaterThan(1050);
    expect(rpm).toBeLessThan(1150);
    engine.stop();
  });

  it('changes engine speed, road speed and gear over time', async () => {
    const { engine, ecu } = await connectDemo();
    const idleRpm = await ecu.getEngineRPM();

    await vi.advanceTimersByTimeAsync(20_000);

    const drivingRpm = await ecu.getEngineRPM();

    expect(drivingRpm).toBeGreaterThan(idleRpm + 500);
    await expect(ecu.getRoadSpeed()).resolves.toBeGreaterThan(20);
    await expect(ecu.getGearSelection()).resolves.toBe(Gear.DriveOrReverse);
    await expect(
      ecu.getThrottlePosition(ThrottlePosType.Corrected),
    ).resolves.toBeGreaterThan(0.1);
    engine.stop();
  });

  it('warms the coolant up', async () => {
    const { engine, ecu } = await connectDemo();

    await vi.advanceTimersByTimeAsync(180_000);

    await expect(ecu.getCoolantTemp()).resolves.toBeGreaterThan(170);
    engine.stop();
  });

  it('keeps lambda trims within a plausible band', async () => {
    const { engine, ecu } = await connectDemo();

    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(1000);

      for (const bank of [0, 1] as const) {
        const short = await ecu.getLambdaTrimShort(bank);
        const long = await ecu.getLambdaTrimLong(bank);

        expect(Math.abs(short)).toBeLessThanOrEqual(25);
        expect(Math.abs(long)).toBeLessThanOrEqual(10);
      }
    }

    engine.stop();
  });

  it('stores a fault and lights the MIL until the codes are cleared', async () => {
    const { engine, ecu } = await connectDemo();
    const faults = await ecu.getFaultCodes();

    expect(faults.purgeValveLeak).toBe(true);
    expect(Object.values(faults).filter(Boolean)).toHaveLength(1);
    await expect(ecu.isMILOn()).resolves.toBe(true);

    await ecu.clearFaultCodes();
    await vi.advanceTimersByTimeAsync(100);

    expect((await ecu.getFaultCodes()).purgeValveLeak).toBe(false);
    await expect(ecu.isMILOn()).resolves.toBe(false);
    engine.stop();
  });

  it('can start without a stored fault', async () => {
    const { engine, ecu } = await connectDemo({ withFault: false });

    expect(Object.values(await ecu.getFaultCodes()).some(Boolean)).toBe(false);
    await expect(ecu.isMILOn()).resolves.toBe(false);
    engine.stop();
  });

  it('stops changing memory after stop()', async () => {
    const { engine } = await connectDemo();

    await vi.advanceTimersByTimeAsync(500);
    engine.stop();

    const before =
      engine.transport.memory[MemoryOffset.EngineSpeedFiltered + 1];

    await vi.advanceTimersByTimeAsync(5000);

    expect(engine.transport.memory[MemoryOffset.EngineSpeedFiltered + 1]).toBe(
      before,
    );
  });
});
