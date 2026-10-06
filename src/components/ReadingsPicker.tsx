// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { MixerHorizontalIcon } from '@radix-ui/react-icons';
import { Popover, VisuallyHidden } from 'radix-ui';
import { useId } from 'react';
import { METRIC_GROUPS, METRICS, metricsInGroup } from '../metrics';
import {
  ALWAYS_READ,
  offExcept,
  READING_PRESETS,
} from '../readings/readingSettings';
import { useReadings } from '../readings/useReadings';
import { MetricCheckbox } from './MetricCheckbox';
import graphs from './GraphsView.module.css';
import styles from './ReadingsPicker.module.css';

/**
 * A button that opens the list of readings to take from the ECU. The
 * choice applies to the tiles, the graphs and recordings; fewer readings
 * are polled faster.
 */
export function ReadingsPicker() {
  const { chosen, off, setOff } = useReadings();
  const titleId = useId();
  const hintId = useId();

  return (
    <Popover.Root>
      <Popover.Trigger className={graphs['pickerTrigger']}>
        <MixerHorizontalIcon aria-hidden="true" />
        Choose readings
        <span className={graphs['count']}>
          {chosen.length} of {METRICS.length}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={`${graphs['picker']} ${styles['picker']}`}
          aria-labelledby={titleId}
          aria-describedby={hintId}
          align="end"
          sideOffset={6}
          collisionPadding={16}
        >
          <h3 id={titleId} className={graphs['pickerTitle']}>
            Readings to take
          </h3>
          <p id={hintId} className={graphs['hint']}>
            The fewer readings you choose, the more often each is read. The
            choice applies to the tiles, the graphs and recordings.
          </p>
          <div className={styles['presets']}>
            <button
              type="button"
              disabled={off.length === 0}
              onClick={() => {
                setOff([]);
              }}
            >
              All
            </button>
            {READING_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setOff(offExcept(preset.keys));
                }}
              >
                {preset.name}
              </button>
            ))}
          </div>
          {METRIC_GROUPS.map((group) => (
            <fieldset key={group.id} className={graphs['pickerGroup']}>
              <legend>{group.title}</legend>
              {metricsInGroup(group.id).map((metric) =>
                ALWAYS_READ.includes(metric.key) ? (
                  <MetricCheckbox
                    key={metric.key}
                    label={metric.label}
                    checked
                    disabled
                    onCheckedChange={() => undefined}
                  >
                    <span className={styles['note']}>always read</span>
                  </MetricCheckbox>
                ) : (
                  <MetricCheckbox
                    key={metric.key}
                    label={metric.label}
                    checked={!off.includes(metric.key)}
                    onCheckedChange={(checked) => {
                      setOff(
                        checked
                          ? off.filter((k) => k !== metric.key)
                          : [...off, metric.key],
                      );
                    }}
                  >
                    <button
                      type="button"
                      className={styles['only']}
                      onClick={() => {
                        setOff(offExcept([metric.key]));
                      }}
                    >
                      Only{' '}
                      <VisuallyHidden.Root>{metric.label}</VisuallyHidden.Root>
                    </button>
                  </MetricCheckbox>
                ),
              )}
            </fieldset>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
