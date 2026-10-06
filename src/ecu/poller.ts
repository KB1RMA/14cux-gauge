// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  AirflowType,
  Bank,
  InvalidReadingError,
  ThrottlePosType,
  type Ecu,
  type Gear,
} from 'comm14cux-ts';
import { isTransientLinkError } from './errors';

/** A reading, or `null` if the ECU returned a value outside its valid range. */
export type Reading<T> = T | null;

/** One pass over the live values. Units are those the library returns. */
export interface LiveSnapshot {
  /** `Date.now()` when the pass finished. */
  timestamp: number;
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
  // Slow-changing values, read every `slowEvery` passes.
  coolantTempF: Reading<number>;
  fuelTempF: Reading<number>;
  mainVoltage: Reading<number>;
  lambdaLongOdd: Reading<number>;
  lambdaLongEven: Reading<number>;
}

type SlowKey =
  | 'coolantTempF'
  | 'fuelTempF'
  | 'mainVoltage'
  | 'lambdaLongOdd'
  | 'lambdaLongEven';

export interface PollerStats {
  /** Completed passes per second, averaged over the last few passes. */
  sampleRateHz: number;
}

export interface PollerOptions {
  /** Pause between passes, in milliseconds. 0 polls as fast as the link allows. */
  intervalMs?: number;
  /** Read the slow-changing values on every Nth pass. */
  slowEvery?: number;
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

  const readSlow = async (): Promise<Pick<LiveSnapshot, SlowKey>> => ({
    coolantTempF: await read(() => ecu.getCoolantTemp()),
    fuelTempF: await read(() => ecu.getFuelTemp()),
    mainVoltage: await read(() => ecu.getMainVoltage()),
    lambdaLongOdd: await read(() => ecu.getLambdaTrimLong(Bank.Odd)),
    lambdaLongEven: await read(() => ecu.getLambdaTrimLong(Bank.Even)),
  });

  const readPass = async (): Promise<LiveSnapshot> => {
    const fast = {
      engineRpm: await read(() => ecu.getEngineRPM()),
      roadSpeedMph: await read(() => ecu.getRoadSpeed()),
      throttle: await read(() =>
        ecu.getThrottlePosition(ThrottlePosType.Corrected),
      ),
      airflow: await read(() => ecu.getMAFReading(AirflowType.Linearized)),
      lambdaShortOdd: await read(() => ecu.getLambdaTrimShort(Bank.Odd)),
      lambdaShortEven: await read(() => ecu.getLambdaTrimShort(Bank.Even)),
      idleBypass: await read(() => ecu.getIdleBypassMotorPosition()),
      gear: await read(() => ecu.getGearSelection()),
      milOn: await read(() => ecu.isMILOn()),
      fuelPumpOn: await read(() => ecu.getFuelPumpRelayState()),
    };
    const slow =
      previous === undefined || pass % slowEvery === 0
        ? await readSlow()
        : previous;

    return {
      timestamp: Date.now(),
      ...fast,
      coolantTempF: slow.coolantTempF,
      fuelTempF: slow.fuelTempF,
      mainVoltage: slow.mainVoltage,
      lambdaLongOdd: slow.lambdaLongOdd,
      lambdaLongEven: slow.lambdaLongEven,
    };
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
