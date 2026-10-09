// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { RowsIcon, ViewGridIcon } from '@radix-ui/react-icons';
import { Toolbar } from 'radix-ui';
import { useHistory } from '../history/useHistory';
import { METRIC_KEYS } from '../metrics';
import { useReadings } from '../readings/useReadings';
import { formatDuration } from '../sessions/format';
import { useSetting } from '../settings/useSetting';
import { GraphGroups } from './GraphGroups';
import { ReadingsPicker } from './ReadingsPicker';
import {
  WINDOW_OPTIONS,
  type GraphLayout,
  type GraphWindow,
} from './graphSettings';
import { TimeSeriesChart } from './TimeSeriesChart';
import styles from './GraphsView.module.css';

function WindowPicker({
  value,
  onChange,
}: {
  value: GraphWindow;
  onChange(window: GraphWindow): void;
}) {
  return (
    <Toolbar.ToggleGroup
      type="single"
      aria-label="Time window"
      className={styles['window']}
      value={String(value)}
      onValueChange={(next) => {
        const option = WINDOW_OPTIONS.find((o) => String(o.value) === next);

        // Radix reports '' when the pressed item is pressed again; keep it.
        if (option) {
          onChange(option.value);
        }
      }}
    >
      {WINDOW_OPTIONS.map((option) => (
        <Toolbar.ToggleItem
          key={option.value}
          value={String(option.value)}
          aria-label={option.name}
          className={styles['windowItem']}
        >
          {option.text}
        </Toolbar.ToggleItem>
      ))}
    </Toolbar.ToggleGroup>
  );
}

function LayoutPicker({
  value,
  onChange,
}: {
  value: GraphLayout;
  onChange(layout: GraphLayout): void;
}) {
  return (
    <Toolbar.ToggleGroup
      type="single"
      aria-label="Layout"
      className={`${styles['window']} ${styles['layout']}`}
      value={value}
      onValueChange={(next) => {
        // Radix reports '' when the pressed item is pressed again; keep it.
        if (next === 'grid' || next === 'stacked') {
          onChange(next);
        }
      }}
    >
      <Toolbar.ToggleItem
        value="grid"
        className={`${styles['windowItem']} ${styles['layoutItem']}`}
      >
        <ViewGridIcon aria-hidden="true" />
        Grid
      </Toolbar.ToggleItem>
      <Toolbar.ToggleItem
        value="stacked"
        className={`${styles['windowItem']} ${styles['layoutItem']}`}
      >
        <RowsIcon aria-hidden="true" />
        Stacked
      </Toolbar.ToggleItem>
    </Toolbar.ToggleGroup>
  );
}

/**
 * Says when the session window no longer reaches back to the start of the
 * session, because the history was full and the oldest samples went.
 */
function TruncatedNote() {
  const { history } = useHistory();
  const earliest = history.earliestTime;
  const latest = history.latestTime;

  if (!history.truncated || earliest === undefined || latest === undefined) {
    return null;
  }

  return (
    <p className={styles['hint']}>
      The graphs hold a limited number of samples, so older ones have been
      dropped. They show the last {formatDuration(latest - earliest)} of the
      session; record the session to keep all of it.
    </p>
  );
}

/** Live graphs of the chosen readings over the chosen time window. */
export function GraphsView() {
  const [settings, setSettings] = useSetting('graphs');
  const { chosen } = useReadings();
  const notChosen = METRIC_KEYS.filter((key) => !chosen.includes(key));

  return (
    <div className={styles['graphs']}>
      <Toolbar.Root aria-label="Graph options" className={styles['toolbar']}>
        <WindowPicker
          value={settings.window}
          onChange={(window) => {
            setSettings((s) => ({ ...s, window }));
          }}
        />
        <div className={styles['toolbarEnd']}>
          <LayoutPicker
            value={settings.layout}
            onChange={(layout) => {
              setSettings((s) => ({ ...s, layout }));
            }}
          />
          <ReadingsPicker inToolbar />
        </div>
      </Toolbar.Root>

      {settings.window === 'session' && <TruncatedNote />}

      <GraphGroups
        hidden={notChosen}
        stacked={settings.layout === 'stacked'}
        chart={(metric) => (
          <TimeSeriesChart
            key={metric.key}
            metric={metric}
            timeWindow={settings.window}
          />
        )}
      />
    </div>
  );
}
