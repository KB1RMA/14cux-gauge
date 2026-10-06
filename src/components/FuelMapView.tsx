// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  FUEL_MAP_COLUMNS,
  FUEL_MAP_ROWS,
  type Ecu,
  type FuelMap,
} from '@kb1rma/libcomm14cux-ts';
import { VisuallyHidden } from 'radix-ui';
import { memo, useEffect, useId, useState, type CSSProperties } from 'react';
import { describeError } from '../ecu/errors';
import type { LiveSnapshot } from '../ecu/poller';
import { hex, hexDigits } from '../hex';
import { useReadings } from '../readings/useReadings';
import panel from './Panel.module.css';
import styles from './FuelMapView.module.css';

interface LoadedMap {
  id: number;
  map: FuelMap;
  /** Engine speed at the start of each column, lowest first. */
  rpm: number[];
}

interface Outcome {
  ecu: Ecu;
  loaded?: LoadedMap;
  error?: string;
}

const ROWS = Array.from({ length: FUEL_MAP_ROWS }, (_, row) => row);
const COLUMNS = Array.from({ length: FUEL_MAP_COLUMNS }, (_, col) => col);

/** The cell a fractional map position falls in, if there is one. */
function cellOf(position: number | null | undefined): number | undefined {
  return position == null ? undefined : Math.floor(position);
}

/**
 * The fuel map the ECU is using, read once, with the cell it is using now
 * marked from the live data.
 */
export function FuelMapView({
  ecu,
  snapshot,
}: {
  ecu: Ecu;
  snapshot: LiveSnapshot | undefined;
}) {
  // Keyed by the ECU it was read from, so a new ECU never shows an old map or
  // error.
  const [outcome, setOutcome] = useState<Outcome | undefined>(undefined);
  const captionId = useId();
  const { request } = useReadings();

  // Read the position in the map while it is shown, even if not chosen.
  useEffect(() => request(['fuelMapRow', 'fuelMapColumn']), [request]);

  useEffect(() => {
    let current = true;

    const load = async (): Promise<LoadedMap> => {
      const id = await ecu.getCurrentFuelMap();

      return {
        id,
        map: await ecu.getFuelMap(id),
        rpm: await ecu.getRpmTable(),
      };
    };

    load().then(
      (result) => {
        if (current) {
          setOutcome({ ecu, loaded: result });
        }
      },
      (e: unknown) => {
        if (current) {
          setOutcome({ ecu, error: describeError(e) });
        }
      },
    );

    return () => {
      current = false;
    };
  }, [ecu]);

  const { loaded, error } = outcome?.ecu === ecu ? outcome : {};

  if (error) {
    return (
      <p role="alert" className={panel['error']}>
        {error}
      </p>
    );
  }

  if (!loaded) {
    return <p className={panel['muted']}>Reading the fuel map…</p>;
  }

  const { id, map, rpm } = loaded;
  const row = cellOf(snapshot?.fuelMapRow);
  const column = cellOf(snapshot?.fuelMapColumn);
  const inUse = row !== undefined && column !== undefined;

  return (
    <div className={styles['map']}>
      <dl className={panel['facts']}>
        <dt>Map in use</dt>
        <dd>{id}</dd>
        <dt>Adjustment factor</dt>
        <dd>{hex(map.adjustmentFactor, 4)}</dd>
        <dt>Row scaler</dt>
        <dd>{hex(map.rowScaler, 2)}</dd>
      </dl>

      <p className={styles['now']}>
        {inUse
          ? `In use now: row ${row + 1}, ${rpm[column] ?? '?'} rpm column (outlined).`
          : 'Waiting for the cell in use.'}
      </p>

      {/* Outside the table, so it wraps to the screen rather than the table. */}
      <p id={captionId} className={styles['caption']}>
        Fuel map {id} values, in hex. Rows run from light to heavy engine load;
        columns are engine speed.
      </p>

      {/* A focusable, named region, so keyboard users can scroll the table
          sideways on a narrow screen. */}
      <section
        className={styles['scroller']}
        aria-labelledby={captionId}
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a scrolling region must be focusable to scroll by keyboard (WCAG 2.1.1)
        tabIndex={0}
      >
        <MapTable id={id} map={map} rpm={rpm} row={row} column={column} />
      </section>
    </div>
  );
}

interface MapTableProps {
  id: number;
  map: FuelMap;
  rpm: number[];
  row: number | undefined;
  column: number | undefined;
}

// Memoised: the live snapshot arrives every pass, but the table only changes
// when the cell in use moves.
const MapTable = memo(function MapTable({
  id,
  map,
  rpm,
  row,
  column,
}: MapTableProps) {
  return (
    <table className={styles['table']}>
      <caption>
        <VisuallyHidden.Root>Fuel map {id}</VisuallyHidden.Root>
      </caption>
      <thead>
        <tr>
          <th scope="col">Row</th>
          {COLUMNS.map((col) => (
            <th key={col} scope="col">
              {rpm[col]}
              <VisuallyHidden.Root> rpm</VisuallyHidden.Root>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r}>
            <th scope="row">{r + 1}</th>
            {COLUMNS.map((col) => {
              const value = map.data[r * FUEL_MAP_COLUMNS + col] ?? 0;
              const current = r === row && col === column;

              return (
                <td
                  key={col}
                  className={styles['cell']}
                  data-current={current || undefined}
                  style={{ '--level': value / 0xff } as CSSProperties}
                >
                  {hexDigits(value, 2)}
                  {current ? (
                    <VisuallyHidden.Root>, in use now</VisuallyHidden.Root>
                  ) : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
});
