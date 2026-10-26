// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { VisuallyHidden } from 'radix-ui';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useLiveSample } from '../ecu/useLiveData';
import { useLiveStatus } from '../ecu/useLiveStatus';
import type { LiveStatus } from '../ecu/liveStatus';
import {
  formatSample,
  METRICS,
  readingState,
  sampleOf,
  type Metric,
  type MetricKey,
} from '../metrics';
import type { Limits } from '../model/limits';
import type { LiveSnapshot } from '../model/snapshot';
import { usePreferences } from '../preferences/usePreferences';
import { useRecording } from '../recording/useRecording';
import { useReadings } from '../readings/useReadings';
import { limitsFor } from '../settings/limitSettings';
import { useSetting } from '../settings/useSetting';
import { DashPicker } from './DashPicker';
import { FullscreenButton } from './FullscreenButton';
import styles from './DashView.module.css';

function DashTile({
  metric,
  sample,
  stale,
  limits,
}: {
  metric: Metric;
  /** In library units; `null` is an invalid reading, `undefined` no data yet. */
  sample: number | null | undefined;
  /** Readings are not being taken now, so any sample is not current. */
  stale: boolean;
  /** The limits to show the reading against. */
  limits?: Limits | undefined;
}) {
  const units = usePreferences();
  const current = stale ? undefined : sample;
  const { tone, note } =
    current == null
      ? { tone: 'normal', note: undefined }
      : readingState(metric, limits, current);
  const unit = metric.unit(units);

  return (
    <div className={styles['tile']} data-tone={tone}>
      <dt className={styles['label']}>{metric.label}</dt>
      <dd className={styles['value']}>
        {stale ? (
          <>
            <span aria-hidden="true" className={styles['reading']}>
              —
            </span>
            <span className={styles['state']}>Stale</span>
          </>
        ) : current === null ? (
          <>
            <span aria-hidden="true" className={styles['reading']}>
              —
            </span>
            <VisuallyHidden.Root>No valid reading</VisuallyHidden.Root>
          </>
        ) : current === undefined ? (
          <>
            <span aria-hidden="true" className={styles['reading']}>
              —
            </span>
            <span className={styles['state']}>Waiting for data</span>
          </>
        ) : (
          <>
            <span
              className={styles['reading']}
              data-words={metric.group === 'states' ? '' : undefined}
            >
              {formatSample(metric, current, units)}
              {unit ? <span className={styles['unit']}> {unit}</span> : null}
            </span>
            {note ? <span className={styles['note']}> {note}</span> : null}
          </>
        )}
      </dd>
    </div>
  );
}

function PolledDashTile({ metric, stale }: { metric: Metric; stale: boolean }) {
  const { ownLimits } = usePreferences();

  return (
    <DashTile
      metric={metric}
      sample={useLiveSample(metric.key)}
      stale={stale}
      limits={limitsFor(metric, ownLimits)}
    />
  );
}

/**
 * How many columns `count` tiles take in a grid `aspect` times as wide as it
 * is tall, so each tile comes out about as wide as a reading (a number and
 * its unit) needs: wider than tall, but not a thin strip. The rows are then
 * filled as evenly as they can be.
 */
function columnsFor(count: number, aspect: number): number {
  const tileAspect = 1.8;
  const columns = Math.min(
    count,
    Math.max(1, Math.round(Math.sqrt((count * aspect) / tileAspect))),
  );

  return Math.ceil(count / Math.ceil(count / columns));
}

/**
 * The grid's shape, in the steps `DashView.module.css` tells apart, and an
 * aspect ratio typical of each.
 */
const GRID_SHAPES = [
  ['tall', 0.6],
  ['square', 1.1],
  ['wide', 1.8],
  ['wider', 2.6],
  ['widest', 3.6],
] as const;

/** The readings in `keys`, in the order of the metrics, one large tile each. */
function DashGrid({
  keys,
  label,
  tile,
}: {
  keys: readonly MetricKey[];
  label: string;
  tile(metric: Metric): ReactNode;
}) {
  const shown = METRICS.filter((metric) => keys.includes(metric.key));

  return shown.length === 0 ? (
    <p className={styles['empty']}>
      No readings chosen. Use “Choose dash readings” to pick some.
    </p>
  ) : (
    <div
      className={styles['fit']}
      style={Object.fromEntries(
        GRID_SHAPES.map(([shape, aspect]) => [
          `--columns-${shape}`,
          columnsFor(shown.length, aspect),
        ]),
      )}
    >
      <dl aria-label={label} className={styles['grid']}>
        {shown.map(tile)}
      </dl>
    </div>
  );
}

/**
 * Like `DashView`'s readings, from `snapshot`, with `status` given, against
 * the limits that apply now.
 */
export function SnapshotDash({
  keys,
  snapshot,
  status,
}: {
  keys: readonly MetricKey[];
  snapshot: LiveSnapshot | undefined;
  status: LiveStatus;
}) {
  const { ownLimits } = usePreferences();

  return (
    <DashGrid
      keys={keys}
      label="Dash readings"
      tile={(metric) => (
        <DashTile
          key={metric.key}
          metric={metric}
          sample={snapshot ? sampleOf(snapshot, metric.key) : undefined}
          stale={!status.live}
          limits={limitsFor(metric, ownLimits)}
        />
      )}
    />
  );
}

function StatusLine({ status }: { status: LiveStatus }) {
  return (
    <output
      className={styles['status']}
      data-live={status.live ? '' : undefined}
    >
      {status.live ? (
        'Live'
      ) : (
        <>
          <strong>Not live.</strong> {status.reason} Readings are not current.
        </>
      )}
    </output>
  );
}

/**
 * A few readings large enough to read from the driver's seat. The readings
 * are the user's choice, kept apart from the Overview's, and are taken from
 * the ECU while the view is open. When readings stop, every value says it is
 * stale and why.
 */
export function DashView() {
  const [{ readings }, setDash] = useSetting('dash');
  const { request, focus } = useReadings();
  const { active, starting } = useRecording();
  const status = useLiveStatus();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const recording = active !== undefined || starting;

  // The control that started the connection may be gone; start at the heading.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => request(readings), [request, readings]);
  // Reading only these makes each faster, but a recording keeps every chosen
  // reading, so it needs them all.
  useEffect(
    () => (recording ? undefined : focus(readings)),
    [focus, readings, recording],
  );

  return (
    <section aria-labelledby={titleId} className={styles['dash']}>
      <div className={styles['bar']}>
        <h2
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className={styles['title']}
        >
          Dash
        </h2>
        <StatusLine status={status} />
        <FullscreenButton />
        <DashPicker
          chosen={readings}
          onChange={(next) => {
            setDash({ readings: next });
          }}
        />
      </div>
      {recording ? (
        <p className={styles['empty']}>
          Recording keeps every chosen reading coming, so these are not read any
          faster. Stop recording to read only the dash’s readings.
        </p>
      ) : null}
      <DashGrid
        keys={readings}
        label="Dash readings"
        tile={(metric) => (
          <PolledDashTile
            key={metric.key}
            metric={metric}
            stale={!status.live}
          />
        )}
      />
    </section>
  );
}
