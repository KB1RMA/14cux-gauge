// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// Memory map and value encodings taken from libcomm14cux via comm14cux-ts;
// written for 14cux-gauge, 2026.

// Demo mode: a SimulatedTransport whose RAM is rewritten on a timer with the
// raw values an ECU would hold for a plausible engine. Each value is encoded
// here as the inverse of the library's decoder for that location.

import {
  FUEL_MAP_ROWS,
  Gear,
  MemoryOffset,
  SimulatedTransport,
  type Transport,
} from '@kb1rma/libcomm14cux-ts';
import { LatencyTransport, type LatencyOptions } from './latencyTransport';
import {
  buildSyntheticRom,
  DEMO_RPM_TABLE,
  DEMO_VOLTAGE_FACTORS,
} from './syntheticRom';

export interface DemoEngineOptions {
  /** How often the simulated engine state advances, in milliseconds. */
  tickMs?: number;
  /** Store a demo fault code (purge valve leak) at start-up. Defaults to true. */
  withFault?: boolean;
  /** How long `link` takes to answer each read. */
  latency?: LatencyOptions;
}

/**
 * Roughly a 7812-baud link with a 1 ms FTDI latency timer: each byte takes
 * about 1.3 ms on the wire.
 */
export const DEMO_LATENCY: LatencyOptions = { perReadMs: 1, perByteMs: 1.3 };

export interface DemoEngine {
  /** The simulated ECU, answering instantly; its memory can be inspected. */
  readonly transport: SimulatedTransport;
  /**
   * The same ECU behind a simulated serial link, so reads take time. This is
   * what the app connects to.
   */
  readonly link: Transport;
  /** Stops the timer. The memory keeps its last values. */
  stop(): void;
}

/** Physical engine state at one moment, before encoding. */
interface EngineState {
  rpm: number;
  targetIdleRpm: number;
  roadSpeedKph: number;
  gear: Gear;
  coolantAdc: number;
  fuelTempAdc: number;
  throttle: number;
  airflow: number;
  idleBypass: number;
  mainVolts: number;
  lambdaShort: [odd: number, even: number];
  lambdaLong: [odd: number, even: number];
  idling: boolean;
  purgeTimer: number;
  acOn: boolean;
  screenHeaterOn: boolean;
}

// One scripted cycle: idle in park, a drive, idle, then a rev sweep in neutral.
const CYCLE_S = 60;
const DRIVE_START_S = 15;
const DRIVE_END_S = 45;
const SWEEP_START_S = 52;
const WARM_UP_TIME_CONSTANT_S = 45;

// Raw thresholds the gear decoder uses: below 0x4D park/neutral, above 0xB3
// drive/reverse.
const GEAR_BYTE: Record<Gear, number> = {
  [Gear.NoReading]: 0x80,
  [Gear.ParkOrNeutral]: 0x20,
  [Gear.DriveOrReverse]: 0xd0,
  [Gear.ManualGearbox]: 0x80,
};

const THROTTLE_MINIMUM_RAW = 0x003c;
// 7,500,000 / 5000 is a whole period, so this decodes exactly.
const RPM_LIMIT = 5000;
const CURRENT_FUEL_MAP = 5;
const DEMO_FAULT_BYTE = 1; // 0x004A
const DEMO_FAULT_MASK = 0x80; // purge valve leak
const FAULT_BLOCK_SIZE = 6;

/** Small deterministic pseudo-random source, so demo runs are repeatable. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 0x100000000;
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function writeByte(memory: Uint8Array, address: number, value: number): void {
  memory[address] = clamp(Math.round(value), 0, 0xff);
}

function writeWord(memory: Uint8Array, address: number, value: number): void {
  const word = clamp(Math.round(value), 0, 0xffff);

  memory[address] = word >> 8;
  memory[address + 1] = word & 0xff;
}

/** Engine speed is stored as a pulse period: 7,500,000 / RPM. */
function rpmToPeriod(rpm: number): number {
  return 7_500_000 / rpm;
}

/** Inverse of the ECU's main-voltage quadratic for the demo ROM's coefficients. */
function voltsToStored(volts: number): number {
  const { a, b, c } = DEMO_VOLTAGE_FACTORS;
  const adc = Math.round((volts + 0.09) / 0.07);
  const root = 8 * b - (adc * a) / 16;

  return Math.floor((root * root + a * c - 64 * b * b) / (4 * a));
}

/** Lambda trims are stored as `(counts + 256) × 128`. */
function trimToRaw(counts: number): number {
  return (Math.round(clamp(counts, -256, 255)) + 256) * 0x80 + 0x40;
}

/**
 * A fuel map index byte: the index in the high nibble and the weighting
 * towards the next row or column, in 16ths, in the low nibble.
 */
function indexByte(position: number, size: number): number {
  const clamped = clamp(position, 0, size - 1);
  const index = Math.floor(clamped);

  return (index << 4) | Math.floor((clamped - index) * 16);
}

/** Where `rpm` falls in the demo RPM table, as a fractional column. */
function columnFor(rpm: number): number {
  const table = DEMO_RPM_TABLE;
  const next = table.findIndex((start) => start > rpm);

  if (next === -1) {
    return table.length - 1;
  }

  if (next === 0) {
    return 0;
  }

  const start = table[next - 1] ?? 0;
  const end = table[next] ?? start;

  return next - 1 + (rpm - start) / (end - start);
}

function bump(phase: number): number {
  return Math.sin(Math.PI * clamp(phase, 0, 1));
}

export function createDemoEngine(options: DemoEngineOptions = {}): DemoEngine {
  const tickMs = options.tickMs ?? 100;
  const transport = new SimulatedTransport();
  const memory = transport.memory;
  const random = createRandom(0x14c0);
  const lambdaShort: [number, number] = [0, 0];
  const lambdaLong: [number, number] = [4, -3];
  let elapsedMs = 0;

  transport.loadRom(buildSyntheticRom());
  writeWord(memory, MemoryOffset.ThrottleMinimumPosition, THROTTLE_MINIMUM_RAW);
  writeWord(memory, MemoryOffset.RPMLimit, rpmToPeriod(RPM_LIMIT));
  writeByte(memory, MemoryOffset.CurrentFuelMapId, CURRENT_FUEL_MAP);

  if (options.withFault ?? true) {
    memory[MemoryOffset.FaultCodes + DEMO_FAULT_BYTE] = DEMO_FAULT_MASK;
  }

  const wander = (trims: [number, number], step: number, limit: number) => {
    for (const i of [0, 1] as const) {
      // A random walk pulled gently back towards zero.
      trims[i] = clamp(
        trims[i] * 0.98 + (random() - 0.5) * step,
        -limit,
        limit,
      );
    }
  };

  const stateAt = (seconds: number): EngineState => {
    const warm = 1 - Math.exp(-seconds / WARM_UP_TIME_CONSTANT_S);
    const idleRpm = 1100 - 350 * warm;
    const cycle = seconds % CYCLE_S;
    const jitter = (random() - 0.5) * 20;

    let rpm = idleRpm + jitter;
    let roadSpeedKph = 0;
    let throttle = 0;
    let gear: Gear = Gear.ParkOrNeutral;

    if (cycle >= DRIVE_START_S && cycle < DRIVE_END_S) {
      const effort = bump(
        (cycle - DRIVE_START_S) / (DRIVE_END_S - DRIVE_START_S),
      );

      gear = Gear.DriveOrReverse;
      roadSpeedKph = 100 * effort;
      throttle = 0.05 + 0.3 * effort;
      rpm = idleRpm + (2400 - idleRpm) * Math.sqrt(effort) + jitter;
    } else if (cycle >= SWEEP_START_S) {
      const effort = bump((cycle - SWEEP_START_S) / (CYCLE_S - SWEEP_START_S));

      throttle = 0.6 * effort;
      rpm = idleRpm + (4500 - idleRpm) * effort * effort + jitter;
    }

    const idling = throttle < 0.02;

    wander(lambdaShort, 6, 25);
    wander(lambdaLong, 0.4, 10);

    // Purge valve: closed while cold, then toggling, then open in the drive.
    const purgeTimer =
      cycle < DRIVE_START_S ? 0 : cycle < DRIVE_START_S + 10 ? 15000 : 30000;

    return {
      rpm,
      purgeTimer,
      acOn: cycle >= 20 && cycle < 40,
      screenHeaterOn: cycle < 25,
      targetIdleRpm: Math.round(idleRpm / 10) * 10,
      roadSpeedKph,
      gear,
      coolantAdc: 160 - 126 * warm,
      fuelTempAdc: 150 - 40 * warm,
      throttle,
      airflow: clamp(0.025 + (rpm / 6000) * (0.15 + throttle), 0, 1),
      idleBypass: idling ? 0.35 - 0.1 * warm : 0.15,
      mainVolts: 14.1 + (random() - 0.5) * 0.2,
      lambdaShort: [...lambdaShort],
      lambdaLong: [...lambdaLong],
      idling,
    };
  };

  const write = (state: EngineState) => {
    writeWord(memory, MemoryOffset.EngineSpeedFiltered, rpmToPeriod(state.rpm));
    writeWord(
      memory,
      MemoryOffset.EngineSpeedInstantaneous,
      rpmToPeriod(state.rpm),
    );
    writeWord(memory, MemoryOffset.TargetIdleSpeed, state.targetIdleRpm);
    writeByte(memory, MemoryOffset.RoadSpeed, state.roadSpeedKph);
    writeByte(memory, MemoryOffset.TransmissionGear, GEAR_BYTE[state.gear]);
    writeByte(memory, MemoryOffset.CoolantTemp, state.coolantAdc);
    writeByte(memory, MemoryOffset.FuelTemp, state.fuelTempAdc);
    writeWord(
      memory,
      MemoryOffset.ThrottlePosition,
      THROTTLE_MINIMUM_RAW + state.throttle * (1023 - THROTTLE_MINIMUM_RAW),
    );
    writeWord(memory, MemoryOffset.MassAirflowLinear, state.airflow * 17290);
    writeWord(memory, MemoryOffset.MassAirflowDirect, state.airflow * 1023);
    writeByte(
      memory,
      MemoryOffset.IdleBypassPosition,
      180 * (1 - state.idleBypass),
    );
    writeWord(memory, MemoryOffset.MainVoltage, voltsToStored(state.mainVolts));
    writeWord(
      memory,
      MemoryOffset.ShortTermLambdaFuelingTrimOdd,
      trimToRaw(state.lambdaShort[0]),
    );
    writeWord(
      memory,
      MemoryOffset.ShortTermLambdaFuelingTrimEven,
      trimToRaw(state.lambdaShort[1]),
    );
    writeWord(
      memory,
      MemoryOffset.LongTermLambdaFuelingTrimOdd,
      trimToRaw(state.lambdaLong[0]),
    );
    writeWord(
      memory,
      MemoryOffset.LongTermLambdaFuelingTrimEven,
      trimToRaw(state.lambdaLong[1]),
    );
    writeWord(
      memory,
      MemoryOffset.InjectorPulseWidth,
      1800 + 4000 * state.airflow,
    );
    writeByte(memory, MemoryOffset.IdleMode, state.idling ? 0x01 : 0x00);
    // Load picks the row; a full meter would reach the bottom row.
    writeByte(
      memory,
      MemoryOffset.FuelMapRowIndex,
      indexByte(state.airflow * 2 * (FUEL_MAP_ROWS - 1), FUEL_MAP_ROWS),
    );
    writeByte(
      memory,
      MemoryOffset.FuelMapColumnIndex,
      indexByte(columnFor(state.rpm), DEMO_RPM_TABLE.length),
    );

    // Port 1 is active-low: bit 6 clear runs the fuel pump, bit 0 clear lights
    // the MIL. The MIL follows the stored fault codes, so clearing them in the
    // UI turns it off.
    const faultsStored = memory
      .subarray(
        MemoryOffset.FaultCodes,
        MemoryOffset.FaultCodes + FAULT_BLOCK_SIZE,
      )
      .some((byte) => byte !== 0);

    // Both flags are active-low: bit 3 of 0x008A clear is A/C on, bit 2 of
    // 0x00DD clear is the screen heater on.
    writeByte(memory, MemoryOffset.Bits008A, state.acOn ? 0xf7 : 0xff);
    writeByte(
      memory,
      MemoryOffset.Bits00DD,
      state.screenHeaterOn ? 0xfb : 0xff,
    );
    writeWord(memory, MemoryOffset.PurgeValveState, state.purgeTimer);
    writeByte(memory, MemoryOffset.Port1, faultsStored ? 0xbe : 0xbf);
  };

  write(stateAt(0));

  const timer = setInterval(() => {
    elapsedMs += tickMs;
    write(stateAt(elapsedMs / 1000));
  }, tickMs);

  return {
    transport,
    link: new LatencyTransport(transport, options.latency ?? DEMO_LATENCY),
    stop: () => {
      clearInterval(timer);
    },
  };
}
