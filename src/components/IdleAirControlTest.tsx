// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import { RadioGroup } from 'radix-ui';
import { useId, useState } from 'react';
import { describeError } from '../ecu/errors';
import type { LiveSnapshot } from '../ecu/poller';
import { formatSample, METRICS, sampleOf } from '../metrics';
import { usePreferences } from '../preferences/usePreferences';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './Panel.module.css';
import testStyles from './IdleAirControlTest.module.css';

type Direction = 'open' | 'close';

/** The library accepts 0 to 255 steps. */
const MIN_STEPS = 1;
const MAX_STEPS = 255;

const BYPASS = METRICS.find((metric) => metric.key === 'idleBypass');

function parseSteps(text: string): number | undefined {
  const steps = Number(text);

  return text.trim() !== '' &&
    Number.isInteger(steps) &&
    steps >= MIN_STEPS &&
    steps <= MAX_STEPS
    ? steps
    : undefined;
}

/**
 * Drives the idle bypass stepper motor a chosen number of steps, once per
 * press, and shows the idle bypass position beside the control. It writes to
 * the ECU, so it sits behind a confirmation. It is never repeated.
 */
export function IdleAirControlTest({
  ecu,
  snapshot,
}: {
  ecu: Ecu;
  snapshot: LiveSnapshot | undefined;
}) {
  const units = usePreferences();
  const stepsId = useId();
  const [direction, setDirection] = useState<Direction>('open');
  const [stepsText, setStepsText] = useState('10');
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<string | undefined>(undefined);

  const steps = parseSteps(stepsText);
  const sample =
    BYPASS && snapshot ? sampleOf(snapshot, BYPASS.key) : undefined;

  const run = async () => {
    setConfirming(false);

    if (steps === undefined) {
      return;
    }

    setRunning(true);
    setError(undefined);
    setDone(undefined);

    try {
      await ecu.driveIdleAirControlMotor(direction === 'open' ? 0 : 1, steps);
      setDone(
        `Commanded ${steps} ${steps === 1 ? 'step' : 'steps'} ${direction}.`,
      );
    } catch (e) {
      // The library writes the direction bit before the step count, so a
      // failure part-way through can leave the ECU changed.
      setError(`The test may have partly run. ${describeError(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className={styles['panel']} aria-labelledby="iac-test-title">
      <h2 id="iac-test-title">Idle air control test</h2>

      <p className={styles['muted']}>
        Moves the idle bypass motor once. The ECU will move it again to hold
        idle speed.
      </p>

      <RadioGroup.Root
        aria-label="Direction"
        value={direction}
        onValueChange={(next) => {
          setDirection(next === 'close' ? 'close' : 'open');
        }}
        className={testStyles['directions']}
      >
        <div className={testStyles['choice']}>
          <RadioGroup.Item
            id={`${stepsId}-open`}
            value="open"
            className={testStyles['radio']}
          >
            <RadioGroup.Indicator className={testStyles['dot']} />
          </RadioGroup.Item>
          <label htmlFor={`${stepsId}-open`}>Open</label>
        </div>
        <div className={testStyles['choice']}>
          <RadioGroup.Item
            id={`${stepsId}-close`}
            value="close"
            className={testStyles['radio']}
          >
            <RadioGroup.Indicator className={testStyles['dot']} />
          </RadioGroup.Item>
          <label htmlFor={`${stepsId}-close`}>Close</label>
        </div>
      </RadioGroup.Root>

      <div className={testStyles['field']}>
        <label htmlFor={stepsId}>Steps</label>
        <input
          id={stepsId}
          type="number"
          inputMode="numeric"
          min={MIN_STEPS}
          max={MAX_STEPS}
          step={1}
          value={stepsText}
          aria-invalid={steps === undefined}
          onChange={(event) => {
            setStepsText(event.target.value);
          }}
          onBlur={() => {
            // Clamp to the valid range once the user is done typing.
            const typed = Number(stepsText);

            if (stepsText.trim() !== '' && Number.isFinite(typed)) {
              setStepsText(
                String(
                  Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.round(typed))),
                ),
              );
            }
          }}
        />
        <span className={styles['muted']}>
          {MIN_STEPS} to {MAX_STEPS}
        </span>
      </div>

      <dl className={styles['facts']}>
        <dt>{BYPASS?.label ?? 'Idle bypass'}</dt>
        <dd>
          {BYPASS && sample !== null && sample !== undefined
            ? `${formatSample(BYPASS, sample, units)} ${BYPASS.unit(units)}`
            : sample === null
              ? 'Invalid'
              : 'No reading'}
        </dd>
      </dl>

      {error ? (
        <p role="alert" className={styles['error']}>
          {error}
        </p>
      ) : null}
      {done ? <output>{done}</output> : null}

      <div className={styles['actions']}>
        <button
          type="button"
          className="danger"
          disabled={running || steps === undefined}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {running ? 'Running…' : 'Run test'}
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Run idle air control test?"
        confirmLabel="Run test"
        onConfirm={() => void run()}
        onCancel={() => {
          setConfirming(false);
        }}
      >
        <p>
          This writes to the ECU&apos;s memory and drives the idle bypass motor{' '}
          {steps} {steps === 1 ? 'step' : 'steps'} {direction}. Engine speed may
          change, and the ECU will re-adjust the motor afterwards.
        </p>
        <p>
          Writing to a running ECU can affect the engine. This software comes
          with no warranty; continue only if you accept the risk.
        </p>
      </ConfirmDialog>
    </section>
  );
}
