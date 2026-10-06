// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { describeError } from '../ecu/errors';
import { useEcu } from '../ecu/useEcu';
import { FuelPumpContext, type FuelPumpPhase } from './context';

/** How long one `runFuelPump` keeps the relay closed: about two seconds. */
export const PUMP_RUN_MS = 2000;
/** Continuous mode asks again this often, before the last run has ended. */
export const PUMP_RENEW_MS = 1500;
/** Continuous mode stops itself after this long. */
export const PUMP_LIMIT_MS = 120_000;

interface Test {
  /** The connection the test belongs to. */
  ecu: Ecu;
  phase: FuelPumpPhase;
}

/**
 * Runs the fuel pump test. Both modes only ever call `Ecu.runFuelPump`;
 * continuous mode calls it again before each run ends. Every way a test ends
 * (stop, the time limit, an error, a lost or closed connection, leaving the
 * view) simply stops asking, so the pump stops within one run.
 */
export function FuelPumpProvider({ children }: { children: ReactNode }) {
  const { ecu } = useEcu();
  const [test, setTest] = useState<Test | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  // A test belongs to its connection: a new or lost one starts clean.
  const current = test && test.ecu === ecu ? test : undefined;
  const phase = current?.phase;
  const commanded = phase === 'once' || phase === 'continuous';

  useEffect(() => {
    if (!ecu || !commanded) {
      return;
    }

    const continuous = phase === 'continuous';
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let cancelled = false;

    const end = (reason?: string) => {
      if (!cancelled) {
        setNotice(reason);
        setTest({ ecu, phase: 'stopped' });
      }
    };

    const later = (action: () => void, ms: number) => {
      // eslint-disable-next-line @eslint-react/web-api-no-leaked-timeout -- every timer is in `timers`, cleared by the cleanup below
      timers.add(setTimeout(action, ms));
    };

    const run = async () => {
      try {
        await ecu.runFuelPump();
      } catch (error) {
        end(`The fuel pump test stopped: ${describeError(error)}`);

        return;
      }

      if (cancelled) {
        return;
      }

      later(
        continuous
          ? () => void run()
          : () => {
              end();
            },
        continuous ? PUMP_RENEW_MS : PUMP_RUN_MS,
      );
    };

    if (continuous) {
      later(() => {
        end('The fuel pump test stopped at its 2 minute time limit.');
      }, PUMP_LIMIT_MS);
    }

    void run();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [ecu, phase, commanded]);

  const start = useCallback(
    (next: 'once' | 'continuous') => {
      if (ecu) {
        setNotice(undefined);
        setTest({ ecu, phase: next });
      }
    },
    [ecu],
  );
  const runOnce = useCallback(() => {
    start('once');
  }, [start]);
  const runContinuously = useCallback(() => {
    start('continuous');
  }, [start]);
  const stop = useCallback(() => {
    setTest((previous) =>
      previous && previous.phase !== 'stopped'
        ? { ...previous, phase: 'stopped' }
        : previous,
    );
  }, []);
  const value = useMemo(
    () => ({ phase, notice, runOnce, runContinuously, stop }),
    [phase, notice, runOnce, runContinuously, stop],
  );

  return <FuelPumpContext value={value}>{children}</FuelPumpContext>;
}
