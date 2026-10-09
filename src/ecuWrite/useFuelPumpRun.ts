// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { NotConnectedError } from '@kb1rma/libcomm14cux-ts';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useEcu } from '../ecu/useEcu';
import type { FinishedOutcome } from '../model/write';
import type { WriteHandle } from './context';
import { useEcuWrite } from './useEcuWrite';
import { failureOutcome, notConnectedOutcome } from './writes';

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Runs the fuel pump test as one ECU write that lasts until the pump has
 * stopped. Both modes only ever call `Ecu.runFuelPump`; continuous mode calls
 * it again before each run ends. Every way a test ends (stop, the time limit,
 * an error, a lost or closed connection, leaving the view) simply stops
 * asking, so the pump stops within one run. The write is held until then, so
 * no other write starts while the pump may still be running.
 */
export function useFuelPumpRun(): {
  /** The mode running, until the test is asked to stop. */
  mode: PumpMode | undefined;
  start(mode: PumpMode): void;
  stop(): void;
} {
  const { ecu } = useEcu();
  const { begin } = useEcuWrite();
  const [pumpRun, setPumpRun] = useState<PumpRun | undefined>(undefined);
  // What a continuous run ending from outside its own loop reports.
  const stopMessageRef = useRef(LEFT_VIEW);
  // The connection as of this commit. A layout effect updates it before the
  // run's cleanup below runs, so the cleanup can tell a closed connection
  // from leaving the view.
  const ecuRef = useRef(ecu);
  // A run belongs to its connection: a new or lost one stops it.
  const live = pumpRun && pumpRun.handle.ecu === ecu ? pumpRun : undefined;

  useLayoutEffect(() => {
    ecuRef.current = ecu;
  }, [ecu]);

  useEffect(() => {
    if (!live) {
      return;
    }

    const { handle, mode } = live;
    const continuous = mode === 'continuous';
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let stopping = false;
    let ran = false;
    // The `runFuelPump` call in progress, if any. Never rejects.
    let inFlight = Promise.resolve();
    // When the last call that may have closed the relay settled.
    let lastSettled: number | undefined;

    stopMessageRef.current = LEFT_VIEW;

    const later = (action: () => void, ms: number) => {
      // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout -- every timer is in `timers`, cleared by `release`, which the cleanup below calls
      timers.add(setTimeout(action, ms));
    };

    // Stops asking, then ends the write once the relay has had time to open:
    // after any call in progress settles, and one run after the last one.
    const release = (outcome: FinishedOutcome) => {
      if (stopping) {
        return;
      }

      stopping = true;
      timers.forEach(clearTimeout);
      void inFlight.then(async () => {
        const runsOn =
          lastSettled === undefined
            ? 0
            : lastSettled + PUMP_RUN_MS - Date.now();

        if (runsOn > 0) {
          await delay(runsOn);
        }

        handle.finish(outcome);
      });
    };

    const end = (outcome: FinishedOutcome) => {
      release(outcome);
      setPumpRun(undefined);
    };

    const run = async () => {
      // A connection that is already closed sends nothing.
      if (!ran && !handle.ecu.isConnected()) {
        end(notConnectedOutcome('fuelPump'));

        return;
      }

      const call = handle.ecu.runFuelPump();

      const settled = () => {
        lastSettled = Date.now();
      };

      inFlight = call.then(settled, settled);

      try {
        await call;
        ran = true;
      } catch (error) {
        end(failureOutcome('fuelPump', error, ran));

        return;
      }

      if (stopping) {
        return;
      }

      if (continuous) {
        later(() => void run(), PUMP_RENEW_MS);
      } else {
        end({ status: 'done', message: STOPPED });
      }
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
      // Stop, leaving the view or a closed connection. Does nothing if the
      // run already ended itself. A single run is never cut short, so it
      // reports only that it stopped. A continuous run whose connection
      // closed did not end as asked, so it is an error.
      if (!continuous) {
        release({ status: 'done', message: STOPPED });
      } else if (ecuRef.current === handle.ecu) {
        release({ status: 'done', message: stopMessageRef.current });
      } else {
        release(
          failureOutcome(
            'fuelPump',
            new NotConnectedError('Not connected to ECU'),
            true,
          ),
        );
      }
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
