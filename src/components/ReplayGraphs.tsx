// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useId, useState } from 'react';
import type { LiveSnapshot } from '../ecu/poller';
import { METRIC_KEYS, METRICS, sampleOf, type MetricKey } from '../metrics';
import type { Replay } from '../replay/useReplay';
import { useStoredState } from '../storage/useStoredState';
import { GraphGroups } from './GraphGroups';
import { GraphPicker } from './GraphPicker';
import { GRAPH_SETTINGS_KEY, parseGraphSettings } from './graphSettings';
import { TimelineChart } from './TimelineChart';
import { TimelineOverview } from './TimelineOverview';
import styles from './GraphsView.module.css';

/** The metric the overview strip draws, if it was recorded. */
const OVERVIEW_METRIC: MetricKey = 'engineRpm';

/**
 * A recording's graphs on one timeline: an overview of the whole session
 * that picks the stretch to show, and a graph per chosen metric over that
 * stretch, sharing the playhead and the pointer's crosshair. Only the
 * `recorded` metrics can be shown. Key it by session: the samples must not
 * change.
 */
export function ReplayGraphs({
  samples,
  replay,
  recorded = METRIC_KEYS,
}: {
  samples: readonly LiveSnapshot[];
  replay: Replay;
  recorded?: readonly MetricKey[];
}) {
  const [settings, setSettings] = useStoredState(
    GRAPH_SETTINGS_KEY,
    parseGraphSettings,
  );
  const syncId = useId();
  // Every sample, in columns, once: the charts slice these as they zoom.
  const [{ times, columns }] = useState(() => {
    const start = samples[0]?.timestamp ?? 0;

    return {
      times: samples.map((sample) => (sample.timestamp - start) / 1000),
      columns: new Map(
        METRIC_KEYS.map((key) => [
          key,
          samples.map((sample) => sampleOf(sample, key)),
        ]),
      ) as ReadonlyMap<MetricKey, (number | null)[]>,
    };
  });
  const column = (key: MetricKey) => columns.get(key) ?? [];
  const overviewKey = recorded.includes(OVERVIEW_METRIC)
    ? OVERVIEW_METRIC
    : recorded[0];
  const overview = METRICS.find((metric) => metric.key === overviewKey);

  return (
    <div className={styles['graphs']}>
      {overview ? (
        <TimelineOverview
          metric={overview}
          times={times}
          samples={column(overview.key)}
          replay={replay}
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
            times={times}
            samples={column(metric.key)}
            replay={replay}
            syncKey={syncId}
          />
        )}
      />
    </div>
  );
}
