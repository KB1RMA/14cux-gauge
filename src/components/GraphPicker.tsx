// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { MixerHorizontalIcon } from '@radix-ui/react-icons';
import { Popover } from 'radix-ui';
import { useId } from 'react';
import {
  METRIC_GROUPS,
  METRIC_KEYS,
  METRICS,
  metricsInGroup,
  type MetricKey,
} from '../metrics';
import { MetricCheckbox } from './MetricCheckbox';
import styles from './GraphsView.module.css';

/**
 * A button that opens a list of the graphs to show or hide, from those
 * `available` (all of them by default).
 */
export function GraphPicker({
  hidden,
  onChange,
  available = METRIC_KEYS,
}: {
  hidden: readonly MetricKey[];
  onChange(hidden: MetricKey[]): void;
  available?: readonly MetricKey[];
}) {
  const titleId = useId();
  const offered = METRICS.filter((m) => available.includes(m.key));
  const shown = offered.filter((m) => !hidden.includes(m.key)).length;

  return (
    <Popover.Root>
      <Popover.Trigger className={styles['pickerTrigger']}>
        <MixerHorizontalIcon aria-hidden="true" />
        Choose graphs
        <span className={styles['count']}>
          {shown} of {offered.length}
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
              disabled={shown === offered.length}
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
          {METRIC_GROUPS.map((group) => {
            const metrics = metricsInGroup(group.id).filter((m) =>
              available.includes(m.key),
            );

            return metrics.length === 0 ? null : (
              <fieldset key={group.id} className={styles['pickerGroup']}>
                <legend>{group.title}</legend>
                {metrics.map((metric) => (
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
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
