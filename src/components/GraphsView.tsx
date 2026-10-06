// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { ToggleGroup } from 'radix-ui';
import { useStoredState } from '../storage/useStoredState';
import { GraphGroups } from './GraphGroups';
import { GraphPicker } from './GraphPicker';
import {
  GRAPH_SETTINGS_KEY,
  parseGraphSettings,
  WINDOW_OPTIONS,
  type WindowSeconds,
} from './graphSettings';
import { TimeSeriesChart } from './TimeSeriesChart';
import styles from './GraphsView.module.css';

function WindowPicker({
  value,
  onChange,
}: {
  value: WindowSeconds;
  onChange(seconds: WindowSeconds): void;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label="Time window"
      className={styles['window']}
      value={String(value)}
      onValueChange={(next) => {
        const option = WINDOW_OPTIONS.find((o) => String(o.seconds) === next);

        // Radix reports '' when the pressed item is pressed again; keep it.
        if (option) {
          onChange(option.seconds);
        }
      }}
    >
      {WINDOW_OPTIONS.map((option) => (
        <ToggleGroup.Item
          key={option.seconds}
          value={String(option.seconds)}
          aria-label={option.name}
          className={styles['windowItem']}
        >
          {option.text}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/** Live graphs of the chosen metrics over the chosen time window. */
export function GraphsView() {
  const [settings, setSettings] = useStoredState(
    GRAPH_SETTINGS_KEY,
    parseGraphSettings,
  );

  return (
    <div className={styles['graphs']}>
      <div className={styles['toolbar']}>
        <WindowPicker
          value={settings.windowSeconds}
          onChange={(windowSeconds) => {
            setSettings((s) => ({ ...s, windowSeconds }));
          }}
        />
        <GraphPicker
          hidden={settings.hidden}
          onChange={(hidden) => {
            setSettings((s) => ({ ...s, hidden }));
          }}
        />
      </div>

      <GraphGroups
        hidden={settings.hidden}
        chart={(metric) => (
          <TimeSeriesChart
            key={metric.key}
            metric={metric}
            windowSeconds={settings.windowSeconds}
          />
        )}
      />
    </div>
  );
}
