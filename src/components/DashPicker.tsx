// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { MixerHorizontalIcon } from '@radix-ui/react-icons';
import { Popover } from 'radix-ui';
import { useId } from 'react';
import {
  METRIC_GROUPS,
  METRIC_KEYS,
  metricsInGroup,
  type MetricKey,
} from '../metrics';
import { DEFAULT_DASH_READINGS } from '../settings/dashSettings';
import { MetricCheckbox } from './MetricCheckbox';
import graphs from './GraphsView.module.css';

/** A button that opens the list of readings the Dash view shows. */
export function DashPicker({
  chosen,
  onChange,
}: {
  chosen: readonly MetricKey[];
  onChange(chosen: MetricKey[]): void;
}) {
  const titleId = useId();
  const hintId = useId();

  return (
    <Popover.Root>
      <Popover.Trigger className={graphs['pickerTrigger']}>
        <MixerHorizontalIcon aria-hidden="true" />
        Choose dash readings
        <span className={graphs['count']}>
          {chosen.length} of {METRIC_KEYS.length}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={graphs['picker']}
          aria-labelledby={titleId}
          aria-describedby={hintId}
          align="end"
          sideOffset={6}
          collisionPadding={16}
        >
          <h3 id={titleId} className={graphs['pickerTitle']}>
            Readings on the dash
          </h3>
          <p id={hintId} className={graphs['hint']}>
            The dash shows only the readings you choose here. They are also read
            from the ECU while the dash is open.
          </p>
          <div className={graphs['pickerActions']}>
            <button
              type="button"
              onClick={() => {
                onChange([...DEFAULT_DASH_READINGS]);
              }}
            >
              Default
            </button>
            <button
              type="button"
              onClick={() => {
                onChange([]);
              }}
            >
              None
            </button>
          </div>
          {METRIC_GROUPS.map((group) => (
            <fieldset key={group.id} className={graphs['pickerGroup']}>
              <legend>{group.title}</legend>
              {metricsInGroup(group.id).map((metric) => (
                <MetricCheckbox
                  key={metric.key}
                  label={metric.label}
                  checked={chosen.includes(metric.key)}
                  onCheckedChange={(checked) => {
                    onChange(
                      METRIC_KEYS.filter((key) =>
                        key === metric.key ? checked : chosen.includes(key),
                      ),
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
