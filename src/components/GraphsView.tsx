// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { CheckIcon, MixerHorizontalIcon } from '@radix-ui/react-icons';
import { Checkbox, Popover, ToggleGroup } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import {
  METRIC_GROUPS,
  METRIC_KEYS,
  METRICS,
  metricsInGroup,
  type MetricKey,
} from '../metrics';
import { useStoredState } from '../storage/useStoredState';
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

function GraphPicker({
  hidden,
  onChange,
}: {
  hidden: readonly MetricKey[];
  onChange(hidden: MetricKey[]): void;
}) {
  const titleId = useId();
  const shown = METRICS.length - hidden.length;

  return (
    <Popover.Root>
      <Popover.Trigger className={styles['pickerTrigger']}>
        <MixerHorizontalIcon aria-hidden="true" />
        Choose graphs
        <span className={styles['count']}>
          {shown} of {METRICS.length}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles['picker']}
          aria-labelledby={titleId}
          align="end"
          sideOffset={6}
          collisionPadding={16}
        >
          <h3 id={titleId} className={styles['pickerTitle']}>
            Graphs to show
          </h3>
          <div className={styles['pickerActions']}>
            <button
              type="button"
              disabled={hidden.length === 0}
              onClick={() => {
                onChange([]);
              }}
            >
              Show all
            </button>
            <button
              type="button"
              disabled={shown === 0}
              onClick={() => {
                onChange([...METRIC_KEYS]);
              }}
            >
              Hide all
            </button>
          </div>
          {METRIC_GROUPS.map((group) => (
            <fieldset key={group.id} className={styles['pickerGroup']}>
              <legend>{group.title}</legend>
              {metricsInGroup(group.id).map((metric) => (
                <MetricCheckbox
                  key={metric.key}
                  label={metric.label}
                  checked={!hidden.includes(metric.key)}
                  onCheckedChange={(checked) => {
                    onChange(
                      checked
                        ? hidden.filter((k) => k !== metric.key)
                        : [...hidden, metric.key],
                    );
                  }}
                />
              ))}
            </fieldset>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MetricCheckbox({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange(checked: boolean): void;
}) {
  const id = useId();

  return (
    <div className={styles['option']}>
      <Checkbox.Root
        id={id}
        className={styles['checkbox']}
        checked={checked}
        onCheckedChange={(state) => {
          onCheckedChange(state === true);
        }}
      >
        <Checkbox.Indicator>
          <CheckIcon aria-hidden="true" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

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

/** Live graphs of the chosen metrics over the chosen time window. */
export function GraphsView() {
  const [settings, setSettings] = useStoredState(
    GRAPH_SETTINGS_KEY,
    parseGraphSettings,
  );
  const visible = (key: MetricKey) => !settings.hidden.includes(key);
  const anyVisible = METRICS.some((m) => visible(m.key));

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

      {anyVisible ? (
        METRIC_GROUPS.map((group) => {
          const metrics = metricsInGroup(group.id).filter((m) =>
            visible(m.key),
          );

          return metrics.length === 0 ? null : (
            <ChartGroup key={group.id} title={group.title}>
              {metrics.map((metric) => (
                <TimeSeriesChart
                  key={metric.key}
                  metric={metric}
                  windowSeconds={settings.windowSeconds}
                />
              ))}
            </ChartGroup>
          );
        })
      ) : (
        <p className={styles['empty']}>
          No graphs are shown. Use Choose graphs to pick some.
        </p>
      )}
    </div>
  );
}
