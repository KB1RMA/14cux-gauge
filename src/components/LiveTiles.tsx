// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useId, type ReactNode } from 'react';
import type { LiveSnapshot } from '../ecu/poller';
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
  snapshot,
}: {
  metric: Metric;
  snapshot: LiveSnapshot | undefined;
}) {
  const units = usePreferences();
  const sample = snapshot ? sampleOf(snapshot, metric.key) : undefined;

  return (
    <Tile
      label={metric.label}
      // `null` is an invalid reading, `undefined` no data yet.
      value={
        sample === null || sample === undefined
          ? sample
          : formatSample(metric, sample, units)
      }
      unit={metric.unit(units)}
      tone={sample == null ? 'normal' : (metric.tone?.(sample) ?? 'normal')}
    />
  );
}

/** A tile for each metric in `keys` (all by default), in sections by group. */
export function LiveTiles({
  snapshot,
  keys = METRIC_KEYS,
}: {
  snapshot: LiveSnapshot | undefined;
  keys?: readonly MetricKey[];
}) {
  return (
    <div className={styles['groups']}>
      {METRIC_GROUPS.map((group) => {
        const metrics = metricsInGroup(group.id).filter((m) =>
          keys.includes(m.key),
        );

        return metrics.length === 0 ? null : (
          <Group key={group.id} title={group.title}>
            {metrics.map((metric) => (
              <MetricTile
                key={metric.key}
                metric={metric}
                snapshot={snapshot}
              />
            ))}
          </Group>
        );
      })}
    </div>
  );
}
