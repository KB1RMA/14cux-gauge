// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { CheckIcon, MixerHorizontalIcon } from '@radix-ui/react-icons';
import { Checkbox, Popover } from 'radix-ui';
import { useId } from 'react';
import {
  METRIC_GROUPS,
  METRIC_KEYS,
  METRICS,
  metricsInGroup,
  type MetricKey,
} from '../metrics';
import styles from './GraphsView.module.css';

/** A button that opens a list of the graphs to show or hide. */
export function GraphPicker({
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
