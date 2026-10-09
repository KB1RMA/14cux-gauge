// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useId, type ReactNode } from 'react';
import { useLiveSample } from '../ecu/useLiveData';
import type { LiveSnapshot } from '../model/snapshot';
import {
  formatSample,
  METRIC_GROUPS,
  METRIC_KEYS,
  metricsInGroup,
  sampleOf,
  type Metric,
  type MetricKey,
} from '../metrics';
import { usePreferences } from '../preferences/usePreferences';
import { Meter } from './Meter';
import { MetricInfo } from './MetricInfo';
import { Tile } from './Tile';
import styles from './LiveTiles.module.css';

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();

  return (
    <section aria-labelledby={id} className={styles['group']}>
      <h3 id={id}>{title}</h3>
      <dl className={styles['grid']}>{children}</dl>
    </section>
  );
}

function MetricTile({
  metric,
  sample,
}: {
  metric: Metric;
  /** In library units; `null` is an invalid reading, `undefined` no data yet. */
  sample: number | null | undefined;
}) {
  const units = usePreferences();

  return (
    <Tile
      label={metric.label}
      value={
        sample === null || sample === undefined
          ? sample
          : formatSample(metric, sample, units)
      }
      unit={metric.unit(units)}
      tone={sample == null ? 'normal' : (metric.tone?.(sample) ?? 'normal')}
      note={sample == null ? undefined : metric.note?.(sample)}
      info={<MetricInfo metric={metric} />}
      meter={
        metric.meter ? (
          <Meter
            meter={metric.meter}
            display={sample == null ? sample : metric.toDisplay(sample, units)}
          />
        ) : undefined
      }
    />
  );
}

/** A tile that follows its own reading, so it changes only when that does. */
function PolledTile({ metric }: { metric: Metric }) {
  return <MetricTile metric={metric} sample={useLiveSample(metric.key)} />;
}

function TileGroups({
  keys,
  tile,
}: {
  keys: readonly MetricKey[];
  tile(metric: Metric): ReactNode;
}) {
  return (
    <div className={styles['groups']}>
      {METRIC_GROUPS.map((group) => {
        const metrics = metricsInGroup(group.id).filter((m) =>
          keys.includes(m.key),
        );

        return metrics.length === 0 ? null : (
          <Group key={group.id} title={group.title}>
            {metrics.map(tile)}
          </Group>
        );
      })}
    </div>
  );
}

/**
 * A tile for each metric in `keys` (all by default), in sections by group,
 * showing the live readings.
 */
export function LiveTiles({
  keys = METRIC_KEYS,
}: {
  keys?: readonly MetricKey[];
}) {
  return (
    <TileGroups
      keys={keys}
      tile={(metric) => <PolledTile key={metric.key} metric={metric} />}
    />
  );
}

/** Like `LiveTiles`, showing the readings in `snapshot`, as replay does. */
export function SnapshotTiles({
  snapshot,
  keys = METRIC_KEYS,
}: {
  snapshot: LiveSnapshot | undefined;
  keys?: readonly MetricKey[];
}) {
  return (
    <TileGroups
      keys={keys}
      tile={(metric) => (
        <MetricTile
          key={metric.key}
          metric={metric}
          sample={snapshot ? sampleOf(snapshot, metric.key) : undefined}
        />
      )}
    />
  );
}
