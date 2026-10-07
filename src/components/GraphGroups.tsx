// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useId, type ReactNode } from 'react';
import {
  METRIC_GROUPS,
  METRICS,
  metricsInGroup,
  type Metric,
  type MetricKey,
} from '../metrics';
import styles from './GraphsView.module.css';

function ChartGroup({
  title,
  stacked,
  children,
}: {
  title: string;
  stacked: boolean;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <section aria-labelledby={id} className={styles['group']}>
      <h3 id={id}>{title}</h3>
      <div className={styles[stacked ? 'stacked' : 'grid']}>{children}</div>
    </section>
  );
}

/**
 * A graph, drawn by `chart`, for each metric not `hidden`, in sections by
 * group; or a hint when every graph is hidden. The graphs sit in a grid,
 * or one under another at full width when `stacked`. Printed, they always
 * stack.
 */
export function GraphGroups({
  hidden,
  stacked = false,
  chart,
}: {
  hidden: readonly MetricKey[];
  stacked?: boolean;
  chart(metric: Metric): ReactNode;
}) {
  const visible = (key: MetricKey) => !hidden.includes(key);

  if (!METRICS.some((m) => visible(m.key))) {
    return (
      <p className={styles['empty']}>
        No graphs are shown. Use Choose graphs to pick some.
      </p>
    );
  }

  return METRIC_GROUPS.map((group) => {
    const metrics = metricsInGroup(group.id).filter((m) => visible(m.key));

    return metrics.length === 0 ? null : (
      <ChartGroup key={group.id} title={group.title} stacked={stacked}>
        {metrics.map((metric) => chart(metric))}
      </ChartGroup>
    );
  });
}
