// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useRef, useState } from 'react';
import { PUMP_LIMIT_MS } from '../pump/FuelPumpProvider';
import { useFuelPump } from '../pump/useFuelPump';
import { ConfirmDialog } from './ConfirmDialog';
import panel from './Panel.module.css';
import styles from './RomImages.module.css';

type Mode = 'once' | 'continuous';

const LIMIT_MINUTES = PUMP_LIMIT_MS / 60_000;

/**
 * Runs the fuel pump with the engine stopped, to check pressure or listen to
 * the pump. Both modes write to the ECU, so each asks first. Whether the pump
 * is really running is shown by the Fuel pump relay reading.
 */
export function FuelPumpTest() {
  const { phase, notice, runOnce, runContinuously, stop } = useFuelPump();
  const [confirming, setConfirming] = useState<Mode | undefined>(undefined);
  const stopRef = useRef<HTMLButtonElement>(null);
  const continuous = phase === 'continuous';
  const running = continuous || phase === 'once';

  // Leaving the view ends a test; the provider outlives this panel.
  useEffect(() => stop, [stop]);

  const confirmMode = confirming;

  return (
    <section className={panel['panel']} aria-labelledby="fuel-pump-title">
      <h2 id="fuel-pump-title">Fuel pump test</h2>
      <p className={styles['hint']}>
        Runs the fuel pump without starting the engine, to check fuel pressure
        or listen to the pump. The Fuel pump relay reading shows whether the ECU
        is running it.
      </p>
      {notice ? <p className={panel['muted']}>{notice}</p> : null}
      <div className={panel['actions']}>
        {continuous ? (
          <button
            ref={stopRef}
            type="button"
            className="primary"
            onClick={stop}
          >
            Stop fuel pump
          </button>
        ) : (
          <button
            type="button"
            disabled={running}
            onClick={() => {
              setConfirming('continuous');
            }}
          >
            Run pump (continuous)
          </button>
        )}
        <button
          type="button"
          disabled={running}
          onClick={() => {
            setConfirming('once');
          }}
        >
          Run pump (once)
        </button>
      </div>

      <ConfirmDialog
        open={confirmMode !== undefined}
        title={
          confirmMode === 'continuous'
            ? 'Run the fuel pump continuously?'
            : 'Run the fuel pump once?'
        }
        confirmLabel="Run fuel pump"
        // A continuous run replaces its button with Stop.
        returnFocusTo={stopRef}
        onConfirm={() => {
          setConfirming(undefined);

          if (confirmMode === 'continuous') {
            runContinuously();
          } else {
            runOnce();
          }
        }}
        onCancel={() => {
          setConfirming(undefined);
        }}
      >
        <p>
          This writes to the ECU&apos;s memory to switch the fuel pump on while
          the engine is stopped. The pump will pressurise the fuel rail, so
          check the fuel system for leaks first and keep sources of ignition
          away.
        </p>
        {confirmMode === 'continuous' ? (
          <p>
            The pump keeps running until you press Stop fuel pump, you leave
            this view, the connection is lost or closed, or {LIMIT_MINUTES}{' '}
            minutes have passed. After you stop it, it runs on for about two
            seconds more.
          </p>
        ) : (
          <p>The ECU runs the pump for about two seconds, then stops it.</p>
        )}
        <p>
          Writing to a running ECU can affect the engine. This software comes
          with no warranty; continue only if you accept the risk.
        </p>
      </ConfirmDialog>
    </section>
  );
}
