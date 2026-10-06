// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import { Tabs } from 'radix-ui';
import { useEffect, useRef } from 'react';
import { useLiveData } from '../ecu/useLiveData';
import { useStoredState } from '../storage/useStoredState';
import { EcuInfo } from './EcuInfo';
import { FaultCodes } from './FaultCodes';
import { FuelMapView } from './FuelMapView';
import { GraphsView } from './GraphsView';
import { DASHBOARD_VIEW_KEY, parseDashboardView } from './graphSettings';
import { LiveTiles } from './LiveTiles';
import styles from './Dashboard.module.css';

export function Dashboard({ ecu }: { ecu: Ecu }) {
  const { snapshot } = useLiveData();
  const [view, setView] = useStoredState(
    DASHBOARD_VIEW_KEY,
    parseDashboardView,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The control that started the connection is gone once the dashboard
  // replaces the connect screen; move focus to the start of the new view.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Tabs.Root
      value={view}
      onValueChange={(next) => {
        setView(parseDashboardView(next));
      }}
      className={styles['views']}
    >
      <Tabs.List aria-label="Dashboard views" className={styles['tabs']}>
        <Tabs.Trigger value="overview" className={styles['tab']}>
          Overview
        </Tabs.Trigger>
        <Tabs.Trigger value="graphs" className={styles['tab']}>
          Graphs
        </Tabs.Trigger>
        <Tabs.Trigger value="fuelMap" className={styles['tab']}>
          Fuel map
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="overview" className={styles['dashboard']}>
        <section className={styles['live']} aria-labelledby="live-title">
          <h2
            id="live-title"
            ref={headingRef}
            tabIndex={-1}
            className={styles['title']}
          >
            Live data
          </h2>
          <LiveTiles snapshot={snapshot} />
        </section>
        <aside className={styles['side']}>
          <FaultCodes ecu={ecu} />
          <EcuInfo ecu={ecu} />
        </aside>
      </Tabs.Content>

      <Tabs.Content value="graphs">
        <section aria-labelledby="graphs-title">
          <h2
            id="graphs-title"
            ref={headingRef}
            tabIndex={-1}
            className={styles['title']}
          >
            Live graphs
          </h2>
          <GraphsView />
        </section>
      </Tabs.Content>

      <Tabs.Content value="fuelMap">
        <section aria-labelledby="fuel-map-title">
          <h2
            id="fuel-map-title"
            ref={headingRef}
            tabIndex={-1}
            className={styles['title']}
          >
            Fuel map
          </h2>
          <FuelMapView ecu={ecu} snapshot={snapshot} />
        </section>
      </Tabs.Content>
    </Tabs.Root>
  );
}
