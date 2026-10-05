// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot, Reading } from '../ecu/poller';
import { usePreferences } from '../preferences/usePreferences';
import {
  formatGear,
  formatPercent,
  formatSigned,
  formatSpeed,
  formatTemperature,
  speedLabel,
  temperatureLabel,
} from '../units';
import { useId, type ReactNode } from 'react';
import { Tile } from './Tile';
import styles from './LiveTiles.module.css';

/** Applies `format` to a reading, keeping `null` (invalid) and `undefined` (no data yet). */
function show<T>(
  reading: Reading<T> | undefined,
  format: (value: T) => string,
): string | null | undefined {
  if (reading === null) {
    return null;
  }

  return reading === undefined ? undefined : format(reading);
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();

  return (
    <section aria-labelledby={id} className={styles['group']}>
      <h3 id={id}>{title}</h3>
      <dl className={styles['grid']}>{children}</dl>
    </section>
  );
}

export function LiveTiles({
  snapshot,
}: {
  snapshot: LiveSnapshot | undefined;
}) {
  const { temperatureUnit, speedUnit } = usePreferences();
  const s = snapshot;
  const tempUnit = temperatureLabel(temperatureUnit);
  const temperature = (f: number) => formatTemperature(f, temperatureUnit);
  const trim = (value: number) => formatSigned(value);

  return (
    <div className={styles['groups']}>
      <Group title="Engine">
        <Tile
          label="Engine speed"
          value={show(s?.engineRpm, String)}
          unit="rpm"
        />
        <Tile
          label="Road speed"
          value={show(s?.roadSpeedMph, (mph) => formatSpeed(mph, speedUnit))}
          unit={speedLabel(speedUnit)}
        />
        <Tile
          label="Coolant"
          value={show(s?.coolantTempF, temperature)}
          unit={tempUnit}
        />
        <Tile
          label="Fuel temp"
          value={show(s?.fuelTempF, temperature)}
          unit={tempUnit}
        />
      </Group>

      <Group title="Airflow and throttle">
        <Tile
          label="Throttle"
          value={show(s?.throttle, (v) => formatPercent(v))}
          unit="%"
        />
        <Tile
          label="Airflow (MAF)"
          value={show(s?.airflow, (v) => formatPercent(v, 1))}
          unit="%"
        />
        <Tile
          label="Idle bypass"
          value={show(s?.idleBypass, (v) => formatPercent(v))}
          unit="% open"
        />
      </Group>

      <Group title="Electrics and fuelling">
        <Tile
          label="Main voltage"
          value={show(s?.mainVoltage, (v) => v.toFixed(1))}
          unit="V"
        />
        <Tile
          label="Short trim, odd"
          value={show(s?.lambdaShortOdd, trim)}
          unit="counts"
        />
        <Tile
          label="Short trim, even"
          value={show(s?.lambdaShortEven, trim)}
          unit="counts"
        />
        <Tile
          label="Long trim, odd"
          value={show(s?.lambdaLongOdd, trim)}
          unit="counts"
        />
        <Tile
          label="Long trim, even"
          value={show(s?.lambdaLongEven, trim)}
          unit="counts"
        />
      </Group>

      <Group title="States">
        <Tile label="Gear" value={show(s?.gear, formatGear)} />
        <Tile
          label="MIL"
          value={show(s?.milOn, (on) => (on ? 'On' : 'Off'))}
          tone={s?.milOn ? 'warn' : 'normal'}
        />
        <Tile
          label="Fuel pump relay"
          value={show(s?.fuelPumpOn, (on) => (on ? 'Running' : 'Off'))}
          tone={s?.fuelPumpOn ? 'good' : 'normal'}
        />
      </Group>
    </div>
  );
}
