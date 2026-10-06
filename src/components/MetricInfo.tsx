// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Metric } from '../metrics';
import { usePreferences } from '../preferences/usePreferences';
import { InfoPopover } from './InfoPopover';

/** An "About" button explaining a reading and its typical values. */
export function MetricInfo({ metric }: { metric: Metric }) {
  const units = usePreferences();
  const typical = metric.typical?.(units);

  return (
    <InfoPopover
      label={metric.label}
      note={
        typical
          ? 'Typical values are a rough guide, not a specification; they vary with the engine, tune and conditions.'
          : undefined
      }
    >
      <p>{metric.description}</p>
      {typical ? (
        <p>
          <strong>Typical:</strong> {typical}
        </p>
      ) : null}
    </InfoPopover>
  );
}
