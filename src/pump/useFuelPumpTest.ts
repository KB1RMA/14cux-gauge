// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEcu } from '../ecu/useEcu';
import type { WriteHandle } from '../ecuWrite/context';
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { failureOutcome } from '../ecuWrite/writes';

/** How long one `runFuelPump` keeps the relay closed: about two seconds. */
export const PUMP_RUN_MS = 2000;
/** Continuous mode asks again this often, before the last run has ended. */
export const PUMP_RENEW_MS = 1500;
/** Continuous mode stops itself after this long. */
export const PUMP_LIMIT_MS = 120_000;

export type PumpMode = 'once' | 'continuous';

interface PumpRun {
  handle: WriteHandle;
  mode: PumpMode;
}

const STOPPED = 'Fuel pump stopped.';
const LEFT_VIEW = 'Fuel pump stopped when you left the view.';

/**
 * Runs the fuel pump test as one ECU write that lasts until the test ends.
 * Both modes only ever call `Ecu.runFuelPump`; continuous mode calls it again
 * before each run ends. Every way a test ends (stop, the time limit, an
 * error, a lost or closed connection, leaving the view) simply stops asking,
 * so the pump stops within one run.
 */
export function useFuelPumpTest(): {
  /** The mode running, if the test is running. */
  mode: PumpMode | undefined;
  start(mode: PumpMode): void;
  stop(): void;
} {
  const { ecu } = useEcu();
  const { begin } = useEcuWrite();
  const [pumpRun, setPumpRun] = useState<PumpRun | undefined>(undefined);
  // What a run ending from outside its own loop reports.
  const stopMessageRef = useRef(LEFT_VIEW);
  // A run belongs to its connection: a new or lost one stops it.
  const live = pumpRun && pumpRun.handle.ecu === ecu ? pumpRun : undefined;

  useEffect(() => {
    if (!live) {
      return;
    }

    const { handle, mode } = live;
    const continuous = mode === 'continuous';
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let cancelled = false;
    let ran = false;

    stopMessageRef.current = LEFT_VIEW;

    const end = (outcome: Parameters<WriteHandle['finish']>[0]) => {
      if (!cancelled) {
        cancelled = true;
        timers.forEach(clearTimeout);
        handle.finish(outcome);
        setPumpRun(undefined);
      }
    };

    const later = (action: () => void, ms: number) => {
      // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout -- every timer is in `timers`, cleared by the cleanup below
      timers.add(setTimeout(action, ms));
    };

    const run = async () => {
      try {
        await handle.ecu.runFuelPump();
        ran = true;
      } catch (error) {
        end(failureOutcome('fuelPump', error, ran));

        return;
      }

      if (cancelled) {
        return;
      }

      later(
        continuous
          ? () => void run()
          : () => {
              end({ status: 'done', message: STOPPED });
            },
        continuous ? PUMP_RENEW_MS : PUMP_RUN_MS,
      );
    };

    if (continuous) {
      later(() => {
        end({
          status: 'done',
          message: 'Fuel pump stopped at its 2 minute time limit.',
        });
      }, PUMP_LIMIT_MS);
    }

    void run();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // Does nothing if the run already ended itself.
      handle.finish({ status: 'done', message: stopMessageRef.current });
    };
  }, [live]);

  const start = useCallback(
    (mode: PumpMode) => {
      const handle = begin('fuelPump');

      if (handle) {
        setPumpRun({ handle, mode });
      }
    },
    [begin],
  );
  const stop = useCallback(() => {
    stopMessageRef.current = STOPPED;
    setPumpRun(undefined);
  }, []);

  return { mode: live?.mode, start, stop };
}
