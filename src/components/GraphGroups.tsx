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
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <section aria-labelledby={id} className={styles['group']}>
      <h3 id={id}>{title}</h3>
      <div className={styles['grid']}>{children}</div>
    </section>
  );
}

/**
 * A graph, drawn by `chart`, for each metric not `hidden`, in sections by
 * group; or a hint when every graph is hidden.
 */
export function GraphGroups({
  hidden,
  chart,
}: {
  hidden: readonly MetricKey[];
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
      <ChartGroup key={group.id} title={group.title}>
        {metrics.map((metric) => chart(metric))}
      </ChartGroup>
    );
  });
}
