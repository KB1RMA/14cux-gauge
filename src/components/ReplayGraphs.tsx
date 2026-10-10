// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useId, useState } from 'react';
import type { TimelineMark } from '../charts/timelinePlugins';
import type { LiveSnapshot } from '../model/snapshot';
import { historyOf } from '../history/pushSnapshot';
import { METRIC_KEYS, METRICS, type MetricKey } from '../metrics';
import type { Replay } from '../replay/useReplay';
import { useSetting } from '../settings/useSetting';
import { GraphGroups } from './GraphGroups';
import { GraphPicker } from './GraphPicker';
import { TimelineChart } from './TimelineChart';
import { TimelineOverview } from './TimelineOverview';
import styles from './GraphsView.module.css';

const NO_MARKS: readonly TimelineMark[] = [];

/** The metric the overview strip draws, if it was recorded. */
const OVERVIEW_METRIC: MetricKey = 'engineRpm';

/**
 * A recording's graphs on one timeline: an overview of the whole session
 * that picks the stretch to show, and a graph per chosen metric over that
 * stretch, sharing the playhead and the pointer's crosshair, with the
 * writes to the ECU marked on each. Only the `recorded` metrics can be
 * shown. Key it by session: the samples and writes must not change.
 */
export function ReplayGraphs({
  samples,
  replay,
  recorded = METRIC_KEYS,
  writes = NO_MARKS,
}: {
  samples: readonly LiveSnapshot[];
  replay: Replay;
  recorded?: readonly MetricKey[];
  writes?: readonly TimelineMark[];
}) {
  const [settings, setSettings] = useSetting('graphs');
  const syncId = useId();
  // Every sample, once, in the same series model as the live graphs: the
  // charts read the stretch they show from it as they zoom.
  const [series] = useState(() => historyOf(samples));
  const overviewKey = recorded.includes(OVERVIEW_METRIC)
    ? OVERVIEW_METRIC
    : recorded[0];
  const overview = METRICS.find((metric) => metric.key === overviewKey);

  return (
    <div className={styles['graphs']}>
      {overview ? (
        <TimelineOverview
          metric={overview}
          series={series}
          replay={replay}
          writes={writes}
        />
      ) : null}
      <div className={styles['toolbar']}>
        <p className={styles['hint']}>
          On a graph: drag across to zoom in, click to move the playhead, Ctrl
          and scroll (or pinch) to zoom, Shift and scroll to pan.
        </p>
        <GraphPicker
          hidden={settings.hidden}
          available={recorded}
          onChange={(hidden) => {
            setSettings((s) => ({ ...s, hidden }));
          }}
        />
      </div>
      <GraphGroups
        hidden={[
          ...settings.hidden,
          ...METRIC_KEYS.filter((key) => !recorded.includes(key)),
        ]}
        chart={(metric) => (
          <TimelineChart
            key={metric.key}
            metric={metric}
            series={series}
            replay={replay}
            syncKey={syncId}
            writes={writes}
          />
        )}
      />
    </div>
  );
}
