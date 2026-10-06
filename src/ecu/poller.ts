// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  AirflowType,
  Bank,
  InvalidReadingError,
  ThrottlePosType,
  type Ecu,
  type FuelMapIndex,
  type Gear,
} from '@kb1rma/libcomm14cux-ts';
import { isTransientLinkError } from './errors';

/** A reading, or `null` if the ECU returned a value outside its valid range. */
export type Reading<T> = T | null;

/** Every live value the poller can read. Units are those the library returns. */
export interface LiveReadings {
  engineRpm: Reading<number>;
  roadSpeedMph: Reading<number>;
  /** Fraction 0–1, corrected for the throttle's closed position. */
  throttle: Reading<number>;
  /** Linearised airflow, as a fraction 0–1 of the meter's range. */
  airflow: Reading<number>;
  lambdaShortOdd: Reading<number>;
  lambdaShortEven: Reading<number>;
  /** Fraction 0–1 (0 closed). */
  idleBypass: Reading<number>;
  gear: Reading<Gear>;
  milOn: Reading<boolean>;
  fuelPumpOn: Reading<boolean>;
  /** Injector pulse width in microseconds. */
  injectorPulseUs: Reading<number>;
  /**
   * The fuel map cell the ECU is using, counted from 0, with the
   * interpolation weighting towards the next row or column as the fraction:
   * 2.5 is halfway between rows 2 and 3.
   */
  fuelMapRow: Reading<number>;
  fuelMapColumn: Reading<number>;
  // Slow-changing values, read every `slowEvery` passes.
  coolantTempF: Reading<number>;
  fuelTempF: Reading<number>;
  mainVoltage: Reading<number>;
  lambdaLongOdd: Reading<number>;
  lambdaLongEven: Reading<number>;
  /** Whether the ECU is controlling the idle speed. */
  idleMode: Reading<boolean>;
  targetIdleRpm: Reading<number>;
}

export type ReadingKey = keyof LiveReadings;

/**
 * One pass over the live values. Only the readings asked for are present: a
 * missing key was not read, while `null` is a reading the ECU got wrong.
 */
export type LiveSnapshot = {
  /** `Date.now()` when the pass finished. */
  timestamp: number;
} & Partial<LiveReadings>;

/** A fuel map index as one number: the index plus its weighting in 16ths. */
function mapPosition({ index, weighting }: FuelMapIndex): number {
  return index + weighting / 16;
}

/** How to read each value, in the order a pass reads them. */
const READERS: {
  [K in ReadingKey]: (ecu: Ecu) => Promise<NonNullable<LiveReadings[K]>>;
} = {
  engineRpm: (ecu) => ecu.getEngineRPM(),
  roadSpeedMph: (ecu) => ecu.getRoadSpeed(),
  throttle: (ecu) => ecu.getThrottlePosition(ThrottlePosType.Corrected),
  airflow: (ecu) => ecu.getMAFReading(AirflowType.Linearized),
  lambdaShortOdd: (ecu) => ecu.getLambdaTrimShort(Bank.Odd),
  lambdaShortEven: (ecu) => ecu.getLambdaTrimShort(Bank.Even),
  idleBypass: (ecu) => ecu.getIdleBypassMotorPosition(),
  gear: (ecu) => ecu.getGearSelection(),
  milOn: (ecu) => ecu.isMILOn(),
  fuelPumpOn: (ecu) => ecu.getFuelPumpRelayState(),
  injectorPulseUs: (ecu) => ecu.getInjectorPulseWidth(),
  fuelMapRow: async (ecu) => mapPosition(await ecu.getFuelMapRowIndex()),
  fuelMapColumn: async (ecu) => mapPosition(await ecu.getFuelMapColumnIndex()),
  coolantTempF: (ecu) => ecu.getCoolantTemp(),
  fuelTempF: (ecu) => ecu.getFuelTemp(),
  mainVoltage: (ecu) => ecu.getMainVoltage(),
  lambdaLongOdd: (ecu) => ecu.getLambdaTrimLong(Bank.Odd),
  lambdaLongEven: (ecu) => ecu.getLambdaTrimLong(Bank.Even),
  idleMode: (ecu) => ecu.getIdleMode(),
  targetIdleRpm: (ecu) => ecu.getTargetIdle(),
};

const READING_ORDER = Object.keys(READERS) as ReadingKey[];

/** Every reading the poller knows. */
export const ALL_READINGS: ReadonlySet<ReadingKey> = new Set(READING_ORDER);

/** Values that change slowly, read only every `slowEvery` passes. */
export const SLOW_READINGS: ReadonlySet<ReadingKey> = new Set([
  'coolantTempF',
  'fuelTempF',
  'mainVoltage',
  'lambdaLongOdd',
  'lambdaLongEven',
  'idleMode',
  'targetIdleRpm',
]);

/** `snapshot` with only the readings in `keys`. */
export function pickReadings(
  snapshot: LiveSnapshot,
  keys: ReadonlySet<ReadingKey>,
): LiveSnapshot {
  return {
    ...(Object.fromEntries(
      Object.entries(snapshot).filter(([key]) => keys.has(key as ReadingKey)),
    ) as Partial<LiveReadings>),
    timestamp: snapshot.timestamp,
  };
}

export interface PollerStats {
  /** Completed passes per second, averaged over the last few passes. */
  sampleRateHz: number;
}

export interface PollerOptions {
  /** Pause between passes, in milliseconds. 0 polls as fast as the link allows. */
  intervalMs?: number;
  /** Read the slow-changing values on every Nth pass. */
  slowEvery?: number;
  /**
   * The readings to take, asked before every pass so a change applies to
   * the next one. Defaults to all of them. Fewer readings make faster passes.
   */
  readings?(): ReadonlySet<ReadingKey>;
  /**
   * The readings the user is watching, from those in `readings()`. Slow
   * values wait for every Nth pass only while one of these is a faster
   * value: readings taken in the background, such as the MIL or the fuel
   * map's position, don't hold them back. Defaults to `readings()`.
   */
  watched?(): ReadonlySet<ReadingKey>;
  /** Consecutive failed passes (timeouts or protocol errors) before giving up. */
  maxConsecutiveErrors?: number;
  onSnapshot(snapshot: LiveSnapshot, stats: PollerStats): void;
  /**
   * Called once if polling stops by itself, with the error that stopped it.
   * Not called after {@link Poller.stop}.
   */
  onError(error: unknown): void;
  /**
   * Called when a pass fails with a transient error and will be retried,
   * with how many passes in a row have now failed.
   */
  onRetry?(error: unknown, consecutiveErrors: number): void;
}

export interface Poller {
  /** Stops polling. A pass in progress is abandoned after its current read. */
  stop(): void;
  readonly running: boolean;
}

const RATE_WINDOW = 10;

class PollAborted extends Error {}

export function startPoller(ecu: Ecu, options: PollerOptions): Poller {
  const intervalMs = options.intervalMs ?? 0;
  const slowEvery = Math.max(1, options.slowEvery ?? 10);
  const maxErrors = options.maxConsecutiveErrors ?? 3;
  const controller = new AbortController();
  const { signal } = controller;
  const finishTimes: number[] = [];
  let previous: LiveSnapshot | undefined;
  let pass = 0;
  let consecutiveErrors = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Reads one value. Out-of-range readings blank just that value; every
  // other error abandons the pass.
  const read = async <T>(get: () => Promise<T>): Promise<Reading<T>> => {
    if (signal.aborted) {
      throw new PollAborted();
    }

    try {
      return await get();
    } catch (error) {
      if (error instanceof InvalidReadingError) {
        return null;
      }

      throw error;
    }
  };

  const readPass = async (): Promise<LiveSnapshot> => {
    const wanted = options.readings?.() ?? ALL_READINGS;
    const keys = READING_ORDER.filter((key) => wanted.has(key));
    const watched = options.watched?.() ?? wanted;
    const anyFast = keys.some(
      (key) => watched.has(key) && !SLOW_READINGS.has(key),
    );
    // Slow values are read every Nth pass, unless nothing faster is watched.
    const slowDue = !anyFast || pass % slowEvery === 0;
    const values: Partial<Record<ReadingKey, unknown>> = {};

    for (const key of keys) {
      const kept = previous?.[key];

      values[key] =
        SLOW_READINGS.has(key) && !slowDue && kept !== undefined
          ? kept
          : await read<unknown>(() => READERS[key](ecu));
    }

    return { timestamp: Date.now(), ...(values as Partial<LiveReadings>) };
  };

  const sampleRate = (): number => {
    const first = finishTimes[0];
    const last = finishTimes[finishTimes.length - 1];

    if (first === undefined || last === undefined || last === first) {
      return 0;
    }

    return ((finishTimes.length - 1) * 1000) / (last - first);
  };

  const fail = (error: unknown) => {
    controller.abort();
    options.onError(error);
  };

  const tick = async () => {
    try {
      const snapshot = await readPass();

      if (signal.aborted) {
        return;
      }

      pass++;
      consecutiveErrors = 0;
      previous = snapshot;
      finishTimes.push(snapshot.timestamp);

      if (finishTimes.length > RATE_WINDOW) {
        finishTimes.shift();
      }

      options.onSnapshot(snapshot, { sampleRateHz: sampleRate() });
    } catch (error) {
      if (signal.aborted || error instanceof PollAborted) {
        return;
      }

      if (!isTransientLinkError(error)) {
        fail(error);

        return;
      }

      consecutiveErrors++;

      if (consecutiveErrors >= maxErrors) {
        fail(error);

        return;
      }

      options.onRetry?.(error, consecutiveErrors);
    }

    // setTimeout rather than setInterval, so passes can never overlap.
    timer = setTimeout(() => void tick(), intervalMs);
  };

  void tick();

  return {
    stop() {
      controller.abort();
      clearTimeout(timer);
    },
    get running() {
      return !signal.aborted;
    },
  };
}
