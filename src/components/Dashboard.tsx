// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Tabs } from 'radix-ui';
import { useEffect, useId, useRef } from 'react';
import { useReadings } from '../readings/useReadings';
import { useFullscreen } from '../screen/useFullscreen';
import { LIVE_TAB_PATHS, type LiveTab } from '../routing/paths';
import { useNavigateOnce } from '../routing/useNavigateOnce';
import { EcuInfo } from './EcuInfo';
import { FaultCodes } from './FaultCodes';
import { FuelMapView } from './FuelMapView';
import { FuelPumpTest } from './FuelPumpTest';
import { GraphsView } from './GraphsView';
import { IdleAirControlTest } from './IdleAirControlTest';
import { LiveTiles } from './LiveTiles';
import { RomImages } from './RomImages';
import { ReadingsPicker } from './ReadingsPicker';
import styles from './Dashboard.module.css';

/** The live views; which one is showing is part of the address. */
export function Dashboard({ tab }: { tab: LiveTab }) {
  const navigate = useNavigateOnce();
  const { chosen } = useReadings();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fullscreen = useFullscreen();
  const fullscreenNoteId = useId();

  // The control that started the connection is gone once the dashboard
  // replaces the connect screen; move focus to the start of the new view.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(next) => {
        const chosen = (Object.keys(LIVE_TAB_PATHS) as LiveTab[]).find(
          (candidate) => candidate === next,
        );

        if (chosen) {
          navigate(LIVE_TAB_PATHS[chosen]);
        }
      }}
      className={styles['views']}
    >
      <div className={styles['tabBar']}>
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
        <div className={styles['fullscreen']}>
          {fullscreen.available ? (
            <button
              type="button"
              aria-pressed={fullscreen.active}
              onClick={() => void fullscreen.toggle()}
            >
              Full screen
            </button>
          ) : (
            <button type="button" disabled aria-describedby={fullscreenNoteId}>
              Full screen
            </button>
          )}
          {fullscreen.available ? null : (
            <span id={fullscreenNoteId} className={styles['note']}>
              Not supported in this browser
            </span>
          )}
          {fullscreen.error ? (
            <span role="alert" className={styles['note']}>
              {fullscreen.error}
            </span>
          ) : null}
        </div>
      </div>

      <Tabs.Content value="overview" className={styles['dashboard']}>
        <section className={styles['live']} aria-labelledby="live-title">
          <div className={styles['heading']}>
            <h2
              id="live-title"
              ref={headingRef}
              tabIndex={-1}
              className={styles['title']}
            >
              Live data
            </h2>
            <ReadingsPicker />
          </div>
          <LiveTiles keys={chosen} />
        </section>
        <aside className={styles['side']}>
          <FaultCodes />
          <FuelPumpTest />
          <IdleAirControlTest />
          <EcuInfo />
          <RomImages />
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
          <FuelMapView />
        </section>
      </Tabs.Content>
    </Tabs.Root>
  );
}
